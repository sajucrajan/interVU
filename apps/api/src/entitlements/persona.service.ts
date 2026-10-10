import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { ResolvedMembership } from "../tenancy/tenant-context";
import { buildAccess } from "./access";
import { type Persona, membershipsFor } from "./persona";

/**
 * What is waiting for a person in the personas they are NOT currently using.
 *
 * The point of personas is that a hiring manager's Today shows hiring-manager
 * work. The cost is that a scorecard they owe as an interviewer is out of
 * sight — so Today and the switcher say "1 waiting as Interviewer", counted
 * by the same rules the worklist uses for the active persona.
 */
@Injectable()
export class PersonaService {
  constructor(private readonly prisma: PrismaService) {}

  async pendingElsewhere(
    organizationId: string,
    orgUserId: string,
    active: Persona | null,
    personas: readonly Persona[],
    allMemberships: readonly ResolvedMembership[],
  ): Promise<{ key: string; label: string; kind: Persona["kind"]; pending: number }[]> {
    const others = personas.filter((p) => p.key !== active?.key);
    if (others.length === 0) return [];
    const units = await this.prisma.orgUnit.findMany({
      where: { organizationId },
      select: { id: true, parentId: true },
    });
    return Promise.all(
      others.map(async (p) => ({
        key: p.key,
        label: p.label,
        kind: p.kind,
        pending:
          p.kind === "interviewer"
            ? await this.owedScorecards(organizationId, orgUserId)
            : await this.roleQueue(organizationId, membershipsFor(p, allMemberships), units),
      })),
    );
  }

  /** Interviews that have ended with no scorecard from this seat. */
  async owedScorecards(organizationId: string, orgUserId: string): Promise<number> {
    const now = Date.now();
    const rows = await this.prisma.interview.findMany({
      where: {
        organizationId,
        panelists: { some: { orgUserId } },
        scorecards: { none: { orgUserId } },
        status: { in: ["scheduled", "completed"] },
        scheduledAt: { lte: new Date(now) },
        application: { decision: null },
      },
      select: { scheduledAt: true, durationMin: true },
    });
    return rows.filter((i) => i.scheduledAt.getTime() + i.durationMin * 60_000 <= now).length;
  }

  /** The role persona's actionable queue, by the worklist's own rules. */
  private async roleQueue(
    organizationId: string,
    memberships: ResolvedMembership[],
    units: { id: string; parentId: string | null }[],
  ): Promise<number> {
    const access = buildAccess(memberships, units);
    const viewScope = access.unitIdsFor("submissions.view");
    const inScope =
      viewScope === "org" ? {} : { position: { orgUnitId: { in: viewScope } } };
    const [unscreened, reviews, decisions, duplicates] = await Promise.all([
      access.can("applications.transition")
        ? this.prisma.application.count({
            where: { organizationId, status: "active", currentStage: "submitted", ...inScope },
          })
        : 0,
      access.can("candidates.merge")
        ? this.prisma.matchReviewItem.count({ where: { organizationId, status: "open" } })
        : 0,
      access.can("decisions.record")
        ? this.prisma.application.count({
            where: {
              organizationId,
              status: "active",
              decision: null,
              interviews: { some: { status: "completed" } },
              ...inScope,
            },
          })
        : 0,
      access.can("submissions.arbitrate")
        ? this.prisma.submission.count({
            where: { organizationId, ownershipStatus: "duplicate", ...inScope },
          })
        : 0,
    ]);
    return unscreened + reviews + decisions + duplicates;
  }
}
