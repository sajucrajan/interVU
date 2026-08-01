import { Controller, Get } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { SlaService, median, type SlaState } from "../sla/sla.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

export interface WorkItemGroup {
  key: string;
  label: string;
  /** One line of context, so the row explains itself without being opened. */
  sub: string;
  count: number;
  href: string;
  tone: "critical" | "warning" | "normal";
  /** When the oldest item in this group started waiting. */
  oldest_at: string | null;
  sla_state: SlaState | null;
  sla_label: string | null;
}

const STAGE_ORDER = ["submitted", "screening", "interviewing", "offer"];

/** Which SLA clock governs each stage's dwell. */
const STAGE_SLA = {
  submitted: "first_screen",
  screening: "first_screen",
  interviewing: "decision_due",
  offer: "decision_due",
} as const;

/**
 * The signed-in user's action queue and pipeline health — the data behind the
 * workspace home. Every figure is filtered by the viewer's entitlements
 * (docs/09), so a team-scoped manager's "needs attention" never counts another
 * team's work.
 *
 * Ages come from real timestamps: an application's clock starts at its latest
 * stage transition (or its creation, if it has never moved), so "time in
 * stage" is not an approximation.
 */
@Controller("me")
@OrgScope()
export class WorklistController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly sla: SlaService,
  ) {}

  @Get("worklist")
  async worklist(@Tenant() tenant: TenantContext) {
    const organizationId = tenant.org!.organizationId;
    const userId = tenant.org!.user.id;
    const access = await this.authz.access(tenant);
    const now = Date.now();

    const viewScope = access.unitIdsFor("submissions.view");
    const inScope =
      viewScope === "org" ? {} : { position: { orgUnitId: { in: viewScope } } };
    const canReview = access.can("candidates.merge");
    const canArbitrate = access.can("submissions.arbitrate");
    const canDecide = access.can("decisions.record");
    const canTransition = access.can("applications.transition");

    const thresholds = await this.sla.thresholds(organizationId);

    const [
      matchReviewRows,
      duplicateRows,
      myScorecardRows,
      awaitingDecisionRows,
      activeApplications,
      upcomingInterviews,
      recentSubmissions,
      offers,
    ] = await Promise.all([
      canReview
        ? this.prisma.matchReviewItem.findMany({
            where: { organizationId, status: "open" },
            select: { createdAt: true },
          })
        : [],
      canArbitrate
        ? this.prisma.submission.findMany({
            where: { organizationId, ownershipStatus: "duplicate", ...inScope },
            select: { receivedAt: true },
          })
        : [],
      this.prisma.interview.findMany({
        where: {
          organizationId,
          panelists: { some: { orgUserId: userId } },
          scorecards: { none: { orgUserId: userId } },
          status: { in: ["scheduled", "completed"] },
        },
        select: { scheduledAt: true },
      }),
      canDecide
        ? this.prisma.application.findMany({
            where: {
              organizationId,
              status: "active",
              decision: null,
              interviews: { some: { status: "completed" } },
              ...inScope,
            },
            select: {
              createdAt: true,
              stageTransitions: { orderBy: { at: "desc" }, take: 1, select: { at: true } },
            },
          })
        : [],
      // Every active application in scope, with the clock that started its
      // current stage — the basis for time-in-stage, dwell and breach counts.
      this.prisma.application.findMany({
        where: { organizationId, status: "active", ...inScope },
        select: {
          currentStage: true,
          createdAt: true,
          stageTransitions: { orderBy: { at: "desc" }, take: 1, select: { at: true } },
        },
      }),
      this.prisma.interview.findMany({
        where: {
          organizationId,
          panelists: { some: { orgUserId: userId } },
          status: "scheduled",
        },
        include: {
          application: {
            include: {
              candidate: { select: { id: true, displayName: true } },
              position: { select: { title: true } },
              decision: { select: { outcome: true } },
            },
          },
          scorecards: { where: { orgUserId: userId }, select: { id: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 5,
      }),
      this.prisma.submission.findMany({
        where: { organizationId, ...inScope },
        include: {
          candidate: { select: { id: true, displayName: true } },
          position: { select: { title: true, reference: true } },
          vendorOrg: { select: { vendor: { select: { name: true } } } },
          matchDecision: { select: { score: true } },
        },
        orderBy: { receivedAt: "desc" },
        take: 6,
      }),
      // Time to OFFER, not to hire: offer acceptance is not modelled yet
      // (handoff item #16), so claiming "time to hire" would overstate it.
      this.prisma.decision.findMany({
        where: { organizationId, outcome: "offer", application: { ...inScope } },
        select: {
          decidedAt: true,
          application: {
            select: {
              positionId: true,
              candidateId: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const enteredStageAt = (a: {
      createdAt: Date;
      stageTransitions: { at: Date }[];
    }) => a.stageTransitions[0]?.at ?? a.createdAt;

    const oldest = (dates: (Date | null | undefined)[]): string | null => {
      const valid = dates.filter(Boolean) as Date[];
      if (valid.length === 0) return null;
      return new Date(Math.min(...valid.map((d) => d.getTime()))).toISOString();
    };

    const stateFor = (
      oldestAt: string | null,
      event: keyof typeof thresholds,
    ): { sla_state: SlaState | null; sla_label: string | null } => {
      if (!oldestAt) return { sla_state: null, sla_label: null };
      const hours = SlaService.hoursSince(oldestAt, now);
      const state = SlaService.state(hours, thresholds[event]);
      return {
        sla_state: state,
        sla_label:
          state === "breached"
            ? `${thresholds[event]}h SLA breached`
            : state === "aging"
              ? `${thresholds[event]}h SLA · aging`
              : `within ${thresholds[event]}h`,
      };
    };

    const unscreened = activeApplications.filter((a) => a.currentStage === "submitted");

    const scorecardOldest = oldest(myScorecardRows.map((i) => i.scheduledAt));
    const reviewOldest = oldest(matchReviewRows.map((r) => r.createdAt));
    const dupOldest = oldest(duplicateRows.map((s) => s.receivedAt));
    const decisionOldest = oldest(awaitingDecisionRows.map(enteredStageAt));
    const unscreenedOldest = oldest(unscreened.map(enteredStageAt));

    const groups: WorkItemGroup[] = (
      [
        {
          key: "scorecards",
          label: "Interviews awaiting your scorecard",
          sub: "The panel cannot resolve until you file",
          count: myScorecardRows.length,
          href: "/interviews",
          tone: "critical",
          oldest_at: scorecardOldest,
          ...stateFor(scorecardOldest, "scorecard_due"),
        },
        {
          key: "decisions",
          label: "Candidates awaiting a decision",
          sub: "Everyone interviewed, nobody decided",
          count: awaitingDecisionRows.length,
          href: "/pipeline?filter=awaiting_decision",
          tone: "critical",
          oldest_at: decisionOldest,
          ...stateFor(decisionOldest, "decision_due"),
        },
        {
          key: "match_reviews",
          label: "Identity matches to review",
          sub: "Uncertain matches need a human call",
          count: matchReviewRows.length,
          href: "/match-reviews",
          tone: "warning",
          oldest_at: reviewOldest,
          ...stateFor(reviewOldest, "first_screen"),
        },
        {
          key: "duplicates",
          label: "Duplicate submission contests",
          sub: "Two vendors claim the same candidate",
          count: duplicateRows.length,
          href: "/pipeline?filter=duplicates",
          tone: "warning",
          oldest_at: dupOldest,
          ...stateFor(dupOldest, "vendor_ack"),
        },
        {
          key: "unscreened",
          label: "New submissions to screen",
          sub: "Not yet looked at by anyone",
          count: unscreened.length,
          href: "/pipeline?filter=unscreened",
          tone: "normal",
          oldest_at: unscreenedOldest,
          ...stateFor(unscreenedOldest, "first_screen"),
        },
      ] as WorkItemGroup[]
    ).filter((g) => g.count > 0);

    // Per-stage health: the split that says whether a queue is merely big or
    // actually late, plus the median dwell.
    const pipeline = STAGE_ORDER.map((stage) => {
      const rows = activeApplications.filter((a) => a.currentStage === stage);
      const threshold = thresholds[STAGE_SLA[stage as keyof typeof STAGE_SLA]];
      const ages = rows.map((a) => SlaService.hoursSince(enteredStageAt(a), now));
      const buckets = { healthy: 0, aging: 0, breached: 0 };
      for (const h of ages) {
        const s = SlaService.state(h, threshold);
        buckets[s === "ok" ? "healthy" : s] += 1;
      }
      return {
        stage,
        count: rows.length,
        ...buckets,
        median_hours: median(ages),
        sla_hours: threshold,
      };
    });

    // What the header counts is what the queue below it shows: the items that
    // are actually late. Counting only stage dwell here read as "0 breached"
    // directly above a row stamped "24h SLA breached".
    const slaBreached = groups
      .filter((g) => g.sla_state === "breached")
      .reduce((n, g) => n + g.count, 0);

    // Median days to hire, and the same figure for the preceding window, so the
    // delta is measured rather than guessed.
    const DAY = 86_400_000;
    const daysToOffer = (d: (typeof offers)[number]) =>
      (d.decidedAt.getTime() - d.application.createdAt.getTime()) / DAY;
    const recentOffers = offers.filter((h) => now - h.decidedAt.getTime() <= 30 * DAY);
    const priorOffers = offers.filter((h) => {
      const age = now - h.decidedAt.getTime();
      return age > 30 * DAY && age <= 60 * DAY;
    });
    const medianTto = median(offers.map(daysToOffer));
    const medianRecent = median(recentOffers.map(daysToOffer));
    const medianPrior = median(priorOffers.map(daysToOffer));

    return {
      user: {
        name: tenant.org!.user.name,
        roles: [...new Set(tenant.org!.memberships.map((m) => m.roleName))],
      },
      total: groups.reduce((n, g) => n + g.count, 0),
      /** The three figures on the page header. `delta` is null when there is
       *  no comparable prior window — better an absent delta than a made-up one. */
      head_stats: {
        in_flight: activeApplications.length,
        median_time_to_offer_days: medianTto === null ? null : Math.round(medianTto),
        median_time_to_offer_delta:
          medianRecent !== null && medianPrior !== null
            ? Math.round(medianRecent - medianPrior)
            : null,
        sla_breached: slaBreached,
      },
      groups,
      pipeline,
      upcoming_interviews: upcomingInterviews.map((i) => ({
        id: i.id,
        round_name: i.roundName,
        scheduled_at: i.scheduledAt,
        candidate: i.application.candidate,
        position_title: i.application.position.title,
        my_scorecard_submitted: i.scorecards.length > 0,
      })),
      recent_submissions: recentSubmissions.map((s) => ({
        id: s.id,
        candidate: s.candidate,
        position_title: s.position.title,
        position_reference: s.position.reference,
        vendor: s.vendorOrg.vendor.name,
        status: s.status,
        ownership_status: s.ownershipStatus,
        received_at: s.receivedAt,
        /** Null when nothing matched — the design renders that as "new"
         *  rather than as a 0% meter, which would read as a bad match. */
        match_score:
          s.matchDecision && s.matchDecision.score > 0 ? s.matchDecision.score : null,
      })),
      sla: thresholds,
    };
  }
}
