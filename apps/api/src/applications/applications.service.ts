import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DecisionCreate, StageTransitionCreate } from "@intervu/contracts";
import type { Access } from "../entitlements/access";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

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
    permission: "applications.transition" | "decisions.record" | "interviews.schedule",
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
    return this.prisma.$transaction(async (tx) => {
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
  }

  async decide(
    organizationId: string,
    applicationId: string,
    access: Access,
    actorId: string,
    input: DecisionCreate,
  ) {
    const application = await this.requireOnUnit(
      organizationId,
      applicationId,
      access,
      "decisions.record",
    );
    const existing = await this.prisma.decision.findUnique({
      where: { applicationId: application.id },
    });
    if (existing) {
      throw new ConflictException({ code: "decision_exists" });
    }
    return this.prisma.$transaction(async (tx) => {
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
  }
}
