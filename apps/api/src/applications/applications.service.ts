import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DecisionCreate, StageTransitionCreate } from "@intervu/contracts";
import type { Access } from "../entitlements/access";
import type { Permission } from "../entitlements/permissions";
import { AuthzService } from "../entitlements/authz.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Tell the OWNING vendor their candidate moved (docs/05 §5): coarse status
   * only, durable email, org email toggle respected. Noise-controlled — only
   * interviewing / offered / not selected are announced.
   */
  private async notifyOwningVendor(
    organizationId: string,
    applicationId: string,
    coarse: "Interviewing" | "Offered" | "Not selected",
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: { select: { displayName: true } },
        position: { select: { title: true } },
      },
    });
    if (!application) return;
    // A direct applicant has no owning vendor, so there is nobody to notify.
    if (!application.sourceSubmissionId) return;
    const owning = await this.prisma.submission.findUnique({
      where: { id: application.sourceSubmissionId },
      include: { vendorOrg: true },
    });
    if (!owning) return;
    if (!(await this.notifications.emailEnabled(organizationId))) return;
    const recipients = await this.prisma.vendorUser.findMany({
      where: { vendorId: owning.vendorOrg.vendorId, status: "active" },
      select: { email: true },
    });
    await this.notifications.enqueueEmail(
      organizationId,
      recipients.map((r) => r.email),
      `Candidate update: ${application.candidate.displayName} — ${coarse}`,
      `Your candidate ${application.candidate.displayName} (${application.position.title}) is now: ${coarse}.

Track your submissions in the portal:
  ${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/vendor

— InterVU`,
      "submission.status_changed",
    );
  }

  list(organizationId: string, viewableUnitIds: "org" | string[], positionId?: string) {
    return this.prisma.application.findMany({
      where: {
        organizationId,
        ...(positionId ? { positionId } : {}),
        position:
          viewableUnitIds === "org" ? undefined : { orgUnitId: { in: viewableUnitIds } },
      },
      include: {
        candidate: { select: { id: true, displayName: true } },
        position: { select: { id: true, title: true, orgUnitId: true, orgUnit: { select: { name: true } } } },
        interviews: { select: { id: true, roundName: true, scheduledAt: true, status: true } },
        decision: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Load an application, 404 outside org, 403 unless `permission` on its unit. */
  async requireOnUnit(
    organizationId: string,
    applicationId: string,
    access: Access,
    // Typed as Permission rather than a hand-kept union: the union silently
    // became a whitelist, and both widening the debrief read and adding
    // applications.reject failed to compile for no reason other than that
    // nobody had added them to it.
    permission: Permission,
  ) {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      include: { position: { select: { orgUnitId: true } } },
    });
    if (!application) throw new NotFoundException("Application not found");
    this.authz.require(access, permission, application.position.orgUnitId);
    return application;
  }

  async transition(
    organizationId: string,
    applicationId: string,
    access: Access,
    actorId: string,
    input: StageTransitionCreate,
  ) {
    const application = await this.requireOnUnit(
      organizationId,
      applicationId,
      access,
      "applications.transition",
    );
    if (application.status !== "active") {
      throw new ConflictException({
        code: "application_closed",
        detail: `Application is ${application.status}`,
      });
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: application.id },
        data: { currentStage: input.to_stage },
      });
      await tx.stageTransition.create({
        data: {
          organizationId,
          applicationId: application.id,
          fromStage: application.currentStage,
          toStage: input.to_stage,
          byId: actorId,
          note: input.note,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "application.transitioned",
          entityType: "application",
          entityId: application.id,
          payload: { from: application.currentStage, to: input.to_stage },
        },
      });
      return updated;
    });
    if (input.to_stage === "interviewing" && application.currentStage !== "interviewing") {
      void this.notifyOwningVendor(organizationId, applicationId, "Interviewing");
    }
    return result;
  }

  async decide(
    organizationId: string,
    applicationId: string,
    access: Access,
    actorId: string,
    input: DecisionCreate,
  ) {
    // A screening rejection and a post-interview verdict are different acts,
    // made by different people, carrying different weight. Recruiters screen
    // dozens a week and must be able to record the outcome of their own work;
    // overturning a panel is a hiring manager's call.
    //
    // The line is INTERVIEWS, not stage: once anyone has been interviewed,
    // even a rejection needs `decisions.record`, so a loop's conclusion can
    // never be recorded by someone who did not see it.
    const interviewed = await this.prisma.interview.count({
      where: { applicationId, organizationId },
    });
    const permission: Permission =
      input.outcome === "reject" && interviewed === 0
        ? "applications.reject"
        : "decisions.record";
    const application = await this.requireOnUnit(
      organizationId,
      applicationId,
      access,
      permission,
    );
    const existing = await this.prisma.decision.findUnique({
      where: { applicationId: application.id },
    });
    if (existing) {
      throw new ConflictException({ code: "decision_exists" });
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const decision = await tx.decision.create({
        data: {
          organizationId,
          applicationId: application.id,
          outcome: input.outcome,
          reason: input.reason,
          decidedById: actorId,
        },
      });
      await tx.application.update({
        where: { id: application.id },
        data:
          input.outcome === "reject"
            ? { status: "rejected" }
            : input.outcome === "offer"
              ? { currentStage: "offer" }
              : {},
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "decision.recorded",
          entityType: "application",
          entityId: application.id,
          payload: { outcome: input.outcome },
        },
      });
      return decision;
    });
    if (input.outcome === "offer") {
      void this.notifyOwningVendor(organizationId, applicationId, "Offered");
    } else if (input.outcome === "reject") {
      void this.notifyOwningVendor(organizationId, applicationId, "Not selected");
    }
    return result;
  }
}
