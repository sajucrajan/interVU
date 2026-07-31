import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { FlagCreate } from "@intervu/contracts";
import type { Access } from "../entitlements/access";
import { PrismaService } from "../prisma/prisma.service";

interface MergeSnapshot {
  identityIds: string[];
  submissionIds: string[];
  applicationIds: string[];
  flagIds: string[];
}

export interface TimelineEvent {
  at: string;
  type:
    | "submission"
    | "stage_change"
    | "interview"
    | "scorecard"
    | "decision"
    | "flag";
  summary: string;
  detail?: Record<string, unknown>;
}

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The cross-position history (R4). Contextual entitlement rule
   * (docs/09 §4.1): candidates.view_history on ANY of the candidate's
   * applications inside the viewer's scope unlocks the whole timeline.
   */
  async timeline(organizationId: string, candidateId: string, access: Access, viewerId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, organizationId },
      include: {
        identities: { select: { kind: true, valueRaw: true } },
        flags: true,
        submissions: {
          include: {
            vendorOrg: { select: { vendor: { select: { name: true } } } },
            position: { select: { title: true } },
          },
        },
        applications: {
          include: {
            position: { select: { id: true, title: true, orgUnitId: true, orgUnit: { select: { name: true } } } },
            stageTransitions: true,
            decision: true,
            interviews: {
              include: {
                panelists: { include: { orgUser: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!candidate) throw new NotFoundException("Candidate not found");

    const historyScope = access.unitIdsFor("candidates.view_history");
    const inScope =
      historyScope === "org" ||
      candidate.applications.some((a) => historyScope.includes(a.position.orgUnitId));
    if (!inScope) {
      throw new ForbiddenException({
        code: "insufficient_scope",
        permission: "candidates.view_history",
      });
    }

    const events: TimelineEvent[] = [];

    for (const s of candidate.submissions) {
      events.push({
        at: s.receivedAt.toISOString(),
        type: "submission",
        summary: `Submitted by ${s.vendorOrg.vendor.name} for ${s.position.title}`,
        detail: { status: s.status, ownership: s.ownershipStatus },
      });
    }
    for (const a of candidate.applications) {
      for (const t of a.stageTransitions) {
        events.push({
          at: t.at.toISOString(),
          type: "stage_change",
          summary: `${a.position.title}: ${t.fromStage} → ${t.toStage}`,
          detail: t.note ? { note: t.note } : undefined,
        });
      }
      for (const i of a.interviews) {
        events.push({
          at: i.scheduledAt.toISOString(),
          type: "interview",
          summary: `${i.roundName} (${a.position.title}) — panel: ${i.panelists
            .map((p) => p.orgUser.name)
            .join(", ")}`,
          detail: { status: i.status },
        });
      }
      if (a.decision) {
        events.push({
          at: a.decision.decidedAt.toISOString(),
          type: "decision",
          summary: `${a.position.title}: ${a.decision.outcome}`,
          detail: a.decision.reason ? { reason: a.decision.reason } : undefined,
        });
      }
    }

    // Scorecards go through the feedback-visibility policy — fetched per
    // application by InterviewsService; here we only include aggregates.
    const scorecards = await this.prisma.scorecard.findMany({
      where: { interview: { application: { candidateId } } },
      include: {
        orgUser: { select: { id: true, name: true } },
        interview: {
          select: {
            roundName: true,
            application: { select: { position: { select: { title: true } } } },
          },
        },
      },
    });
    for (const sc of scorecards) {
      events.push({
        at: sc.submittedAt.toISOString(),
        type: "scorecard",
        summary: `${sc.orgUser.name} on ${sc.interview.roundName} (${sc.interview.application.position.title}): ${sc.recommendation.replaceAll("_", " ")} (${sc.overallRating}/5)`,
      });
    }
    void viewerId; // per-viewer scorecard redaction happens on the application endpoint

    const now = new Date();
    for (const f of candidate.flags) {
      if (f.expiresAt && f.expiresAt < now) continue;
      events.push({
        at: f.createdAt.toISOString(),
        type: "flag",
        summary: `${f.kind.replaceAll("_", " ").toUpperCase()}: ${f.reason}`,
      });
    }

    events.sort((a, b) => (a.at < b.at ? 1 : -1));

    return {
      candidate: {
        id: candidate.id,
        display_name: candidate.displayName,
        current_title: candidate.currentTitle,
        current_employer: candidate.currentEmployer,
        location: candidate.location,
        identities: candidate.identities,
        active_flags: candidate.flags
          .filter((f) => !f.expiresAt || f.expiresAt >= now)
          .map((f) => ({ kind: f.kind, reason: f.reason })),
      },
      applications: candidate.applications.map((a) => ({
        id: a.id,
        position: a.position.title,
        team: a.position.orgUnit.name,
        stage: a.currentStage,
        status: a.status,
      })),
      events,
    };
  }

  /**
   * Merge `mergedId` into `survivingId` (docs/04 §3): all child rows move to
   * the survivor; the merged row stays (empty, marked merged_into_id) so the
   * merge is reversible. Blocked when both candidates hold an application on
   * the same position — that contest needs human untangling first.
   */
  async merge(
    organizationId: string,
    survivingId: string,
    mergedId: string,
    actorId: string,
  ) {
    if (survivingId === mergedId) {
      throw new ConflictException({ code: "self_merge" });
    }
    const [surviving, merged] = await Promise.all([
      this.prisma.candidate.findFirst({
        where: { id: survivingId, organizationId, mergedIntoId: null },
      }),
      this.prisma.candidate.findFirst({
        where: { id: mergedId, organizationId, mergedIntoId: null },
        include: {
          identities: { select: { id: true } },
          submissions: { select: { id: true } },
          applications: { select: { id: true, positionId: true } },
          flags: { select: { id: true } },
        },
      }),
    ]);
    if (!surviving || !merged) throw new NotFoundException("Candidate not found");

    const survivorApps = await this.prisma.application.findMany({
      where: { candidateId: survivingId },
      select: { positionId: true },
    });
    const survivorPositions = new Set(survivorApps.map((a) => a.positionId));
    const collision = merged.applications.find((a) => survivorPositions.has(a.positionId));
    if (collision) {
      throw new ConflictException({
        code: "application_collision",
        detail:
          "Both candidates have an application on the same position; resolve that pipeline first",
      });
    }

    const snapshot: MergeSnapshot = {
      identityIds: merged.identities.map((i) => i.id),
      submissionIds: merged.submissions.map((s) => s.id),
      applicationIds: merged.applications.map((a) => a.id),
      flagIds: merged.flags.map((f) => f.id),
    };

    return this.prisma.$transaction(async (tx) => {
      await tx.candidateIdentity.updateMany({
        where: { candidateId: mergedId },
        data: { candidateId: survivingId },
      });
      await tx.submission.updateMany({
        where: { candidateId: mergedId },
        data: { candidateId: survivingId },
      });
      await tx.application.updateMany({
        where: { candidateId: mergedId },
        data: { candidateId: survivingId },
      });
      await tx.candidateFlag.updateMany({
        where: { candidateId: mergedId },
        data: { candidateId: survivingId },
      });
      await tx.candidate.update({
        where: { id: mergedId },
        data: { mergedIntoId: survivingId },
      });
      const event = await tx.mergeEvent.create({
        data: {
          organizationId,
          survivingCandidateId: survivingId,
          mergedCandidateId: mergedId,
          performedById: actorId,
          snapshot: snapshot as unknown as object,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "candidate.merged",
          entityType: "candidate",
          entityId: survivingId,
          payload: { mergedCandidateId: mergedId, mergeEventId: event.id },
        },
      });
      return event;
    });
  }

  /** Un-merge: restore exactly the rows the snapshot says moved. */
  async reverseMerge(organizationId: string, mergeEventId: string, actorId: string) {
    const event = await this.prisma.mergeEvent.findFirst({
      where: { id: mergeEventId, organizationId },
    });
    if (!event) throw new NotFoundException("Merge event not found");
    if (event.reversedAt) throw new ConflictException({ code: "already_reversed" });

    const snap = event.snapshot as unknown as MergeSnapshot;
    return this.prisma.$transaction(async (tx) => {
      await tx.candidateIdentity.updateMany({
        where: { id: { in: snap.identityIds } },
        data: { candidateId: event.mergedCandidateId },
      });
      await tx.submission.updateMany({
        where: { id: { in: snap.submissionIds } },
        data: { candidateId: event.mergedCandidateId },
      });
      await tx.application.updateMany({
        where: { id: { in: snap.applicationIds } },
        data: { candidateId: event.mergedCandidateId },
      });
      await tx.candidateFlag.updateMany({
        where: { id: { in: snap.flagIds } },
        data: { candidateId: event.mergedCandidateId },
      });
      await tx.candidate.update({
        where: { id: event.mergedCandidateId },
        data: { mergedIntoId: null },
      });
      const updated = await tx.mergeEvent.update({
        where: { id: event.id },
        data: { reversedAt: new Date(), reversedById: actorId },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "candidate.merge_reversed",
          entityType: "candidate",
          entityId: event.mergedCandidateId,
          payload: { mergeEventId: event.id },
        },
      });
      return updated;
    });
  }

  async addFlag(
    organizationId: string,
    candidateId: string,
    actorId: string,
    input: FlagCreate,
  ) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, organizationId },
    });
    if (!candidate) throw new NotFoundException("Candidate not found");
    return this.prisma.$transaction(async (tx) => {
      const flag = await tx.candidateFlag.create({
        data: {
          organizationId,
          candidateId,
          kind: input.kind,
          reason: input.reason,
          createdById: actorId,
          expiresAt: input.expires_at ? new Date(input.expires_at) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorType: "org_user",
          actorId,
          event: "candidate.flagged",
          entityType: "candidate",
          entityId: candidateId,
          payload: { kind: input.kind },
        },
      });
      return flag;
    });
  }
}
