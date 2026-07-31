import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { FlagCreate } from "@intervu/contracts";
import type { Access } from "../entitlements/access";
import { PrismaService } from "../prisma/prisma.service";

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
