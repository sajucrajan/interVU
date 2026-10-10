import { Controller, Get } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { isInterviewer } from "../entitlements/persona";
import { PersonaService } from "../entitlements/persona.service";
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
  /** How many items in this group are past their threshold. The group's
   *  state follows its oldest item; the header counts these. */
  late: number;
  /** Of those, how many tipped over since Monday. */
  late_this_week: number;
  /** Who the queue waits on: "you", or the role that works it. */
  waiting_on: string;
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
    private readonly personas: PersonaService,
  ) {}

  @Get("worklist")
  async worklist(@Tenant() tenant: TenantContext) {
    const organizationId = tenant.org!.organizationId;
    const userId = tenant.org!.user.id;
    const access = await this.authz.access(tenant);
    const now = Date.now();
    // Panel seats count only while acting as interviewer (docs/09 §7); in a
    // role persona the scorecard queue is reported under `other_personas`.
    const interviewer = isInterviewer(tenant.org!.persona);

    const viewScope = access.unitIdsFor("submissions.view");
    const inScope =
      viewScope === "org" ? {} : { position: { orgUnitId: { in: viewScope } } };
    const canReview = access.can("candidates.merge");
    const canArbitrate = access.can("submissions.arbitrate");
    const canDecide = access.can("decisions.record");
    const canTransition = access.can("applications.transition");
    const seesPipeline = access.can("submissions.view");

    const thresholds = await this.sla.thresholds(organizationId);

    const [
      matchReviewRows,
      duplicateRows,
      myScorecardRows,
      awaitingDecisionRows,
      activeApplications,
      upcomingInterviews,
      recentSubmissions,
      panelSeats,
      offers,
    ] = await Promise.all([
      canReview
        ? this.prisma.matchReviewItem.findMany({
            where: { organizationId, status: "open" },
            select: { createdAt: true, score: true },
          })
        : [],
      canArbitrate
        ? this.prisma.submission.findMany({
            where: { organizationId, ownershipStatus: "duplicate", ...inScope },
            select: { receivedAt: true },
          })
        : [],
      // Only interviews that have already started can owe a scorecard; the
      // end-time cut is applied below, since the duration lives on the row.
      // Counting next week's interview here told an interviewer who had just
      // filed everything that a scorecard was still outstanding.
      interviewer
        ? this.prisma.interview.findMany({
        where: {
          organizationId,
          panelists: { some: { orgUserId: userId } },
          scorecards: { none: { orgUserId: userId } },
          status: { in: ["scheduled", "completed"] },
          scheduledAt: { lte: new Date(now) },
        },
        select: { scheduledAt: true, durationMin: true },
      })
        : [],
      canDecide || seesPipeline
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
          positionId: true,
          sourceSubmissionId: true,
          stageTransitions: { orderBy: { at: "desc" }, take: 1, select: { at: true } },
        },
      }),
      interviewer
        ? this.prisma.interview.findMany({
        where: {
          organizationId,
          panelists: { some: { orgUserId: userId } },
          status: "scheduled",
          // "Next up" is the future. A scheduled interview that already ran is
          // a scorecard owed, and is counted in the queue instead.
          scheduledAt: { gte: new Date(now) },
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
      })
        : [],
      this.prisma.submission.findMany({
        where: { organizationId, ...inScope },
        include: {
          candidate: {
            select: {
              id: true,
              displayName: true,
              currentTitle: true,
              currentEmployer: true,
            },
          },
          position: { select: { title: true, reference: true } },
          vendorOrg: { select: { vendor: { select: { name: true } } } },
          matchDecision: { select: { score: true } },
        },
        orderBy: { receivedAt: "desc" },
        take: 6,
      }),
      // Whether this person ever sits on a panel. It decides whether "My
      // interviews" means anything to them.
      interviewer
        ? this.prisma.interviewPanelist.count({
        where: { orgUserId: userId, interview: { organizationId } },
      })
        : 0,
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

    // Tier of the vendor that sourced each unscreened application, and any
    // prior rejection for the candidates being interviewed next — both feed
    // strings the design shows but the old payload could not produce.
    const unscreenedRows = activeApplications.filter(
      (a) => a.currentStage === "submitted",
    );
    const [sourceSubs, priorRejects] = await Promise.all([
      unscreenedRows.length
        ? this.prisma.submission.findMany({
            where: { id: { in: unscreenedRows.map((a) => a.sourceSubmissionId).filter((id): id is string => id !== null) } },
            select: { id: true, vendorOrg: { select: { tier: true } } },
          })
        : [],
      upcomingInterviews.length
        ? this.prisma.decision.findMany({
            where: {
              organizationId,
              outcome: "reject",
              application: {
                candidateId: {
                  in: upcomingInterviews.map((i) => i.application.candidateId),
                },
              },
            },
            select: { application: { select: { candidateId: true } } },
          })
        : [],
    ]);
    const tier1 = sourceSubs.filter((x) => x.vendorOrg.tier === 1).length;
    const rejectedBefore = new Set(
      priorRejects.map((d) => d.application.candidateId),
    );

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
      const h = thresholds[event];
      const window = h % 24 === 0 ? `${h / 24}d` : `${h}h`;
      return {
        sla_state: state,
        // The design states the window while there is still time, and only the
        // verdict once there isn't.
        sla_label: state === "breached" ? "Breached" : `${window} SLA`,
      };
    };

    // "Probabilistic scores between 62% and 78%" — the actual spread of what
    // is waiting, so the reviewer knows how borderline the queue is.
    const reviewScores = matchReviewRows.map((r) => r.score).sort((a, b) => a - b);
    const pct = (x: number) => Math.round(x * 100);
    const reviewScoreRange = !reviewScores.length
      ? "Uncertain matches need a human call"
      : pct(reviewScores[0]!) === pct(reviewScores[reviewScores.length - 1]!)
        ? `Probabilistic ${reviewScores.length === 1 ? "score" : "scores"} of ${pct(reviewScores[0]!)}%`
        : `Probabilistic scores between ${pct(reviewScores[0]!)}% and ${pct(
            reviewScores[reviewScores.length - 1]!,
          )}%`;

    // Per item, not per group. The header used to add up every item in any
    // group whose OLDEST item was late, so one overdue screen made all ten
    // new submissions count as breached.
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const hoursSinceMonday = (now - monday.getTime()) / 3_600_000;
    const lateness = (dates: (Date | null | undefined)[], event: keyof typeof thresholds) => {
      const ages = (dates.filter(Boolean) as Date[]).map((d) => SlaService.hoursSince(d, now));
      const over = ages.filter((h) => h >= thresholds[event]);
      return {
        late: over.length,
        // Breached now, but younger than "threshold + time since Monday",
        // so it tipped over during this week rather than before it.
        late_this_week: over.filter((h) => h < thresholds[event] + hoursSinceMonday).length,
      };
    };

    // The scorecard clock starts when the interview ENDS, not when it starts.
    const owedScorecardSince = myScorecardRows
      .map((i) => new Date(i.scheduledAt.getTime() + i.durationMin * 60_000))
      .filter((end) => end.getTime() <= now);
    const scorecardOldest = oldest(owedScorecardSince);
    const reviewOldest = oldest(matchReviewRows.map((r) => r.createdAt));
    const dupOldest = oldest(duplicateRows.map((s) => s.receivedAt));
    const decisionOldest = oldest(awaitingDecisionRows.map(enteredStageAt));
    const unscreenedOldest = oldest(unscreenedRows.map(enteredStageAt));

    // Each queue carries who can act on it. A queue the viewer can see but not
    // work (a project manager looking at unscreened submissions) used to be
    // headlined "waiting on you"; it now goes to `watching` instead, so the
    // count at the top of Today only ever means work this person can do.
    const all: (WorkItemGroup & { mine: boolean })[] = (
      [
        {
          key: "unscreened",
          mine: canTransition,
          waiting_on: "recruiters",
          label: canTransition ? "New submissions to screen" : "New submissions not yet screened",
          sub: `Across ${new Set(unscreenedRows.map((a) => a.positionId)).size} role${
            new Set(unscreenedRows.map((a) => a.positionId)).size === 1 ? "" : "s"
          } · ${tier1} from tier-1 vendors`,
          count: unscreenedRows.length,
          href: "/pipeline?filter=unscreened",
          tone: "warning",
          oldest_at: unscreenedOldest,
          ...stateFor(unscreenedOldest, "first_screen"),
          ...lateness(unscreenedRows.map(enteredStageAt), "first_screen"),
        },
        {
          key: "match_reviews",
          mine: canReview,
          waiting_on: "recruiters",
          label: "Uncertain identity matches",
          sub: reviewScoreRange,
          count: matchReviewRows.length,
          href: "/match-reviews",
          tone: "critical",
          oldest_at: reviewOldest,
          ...stateFor(reviewOldest, "first_screen"),
          ...lateness(matchReviewRows.map((r) => r.createdAt), "first_screen"),
        },
        {
          key: "decisions",
          mine: canDecide,
          waiting_on: "hiring managers",
          label: canDecide ? "Decisions awaiting you" : "Candidates awaiting a decision",
          sub: "All interviews complete, scorecards in",
          count: awaitingDecisionRows.length,
          href: "/pipeline?filter=awaiting_decision",
          tone: "warning",
          oldest_at: decisionOldest,
          ...stateFor(decisionOldest, "decision_due"),
          ...lateness(awaitingDecisionRows.map(enteredStageAt), "decision_due"),
        },
        {
          key: "scorecards",
          mine: interviewer,
          waiting_on: "you",
          label: "Your scorecards not submitted",
          sub: "Feedback stays hidden until you file yours",
          count: owedScorecardSince.length,
          href: "/interviews",
          tone: "normal",
          oldest_at: scorecardOldest,
          ...stateFor(scorecardOldest, "scorecard_due"),
          ...lateness(owedScorecardSince, "scorecard_due"),
        },
        {
          key: "duplicates",
          mine: canArbitrate,
          waiting_on: "recruiters",
          label: "Duplicate submission contests",
          sub: "Two vendors claim the same candidate",
          count: duplicateRows.length,
          href: "/pipeline?filter=duplicates",
          tone: "warning",
          oldest_at: dupOldest,
          ...stateFor(dupOldest, "vendor_ack"),
          ...lateness(duplicateRows.map((s) => s.receivedAt), "vendor_ack"),
        },
      ] as (WorkItemGroup & { mine: boolean })[]
    ).filter((g) => g.count > 0);
    const strip = ({ mine: _mine, ...g }: (typeof all)[number]) => g;
    const groups: WorkItemGroup[] = all.filter((g) => g.mine).map(strip);
    const watching = seesPipeline ? all.filter((g) => !g.mine).map(strip) : [];

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
    const shown = [...groups, ...watching];
    const slaBreached = shown.reduce((n, g) => n + g.late, 0);
    const breachedSinceMonday = shown.reduce((n, g) => n + g.late_this_week, 0);

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
        roles: [tenant.org!.persona!.label],
        persona: tenant.org!.persona,
      },
      /** Work waiting in the personas this person is NOT using right now. */
      other_personas: await this.personas.pendingElsewhere(
        organizationId,
        userId,
        tenant.org!.persona,
        tenant.org!.personas,
        tenant.org!.allMemberships,
      ),
      total: groups.reduce((n, g) => n + g.count, 0),
      /** False for a read-only role: nothing can ever wait on them, so Today
       *  shows them where things stand instead of an empty to-do list. */
      actionable:
        canTransition || canReview || canArbitrate || canDecide || panelSeats > 0,
      /** Whether "My interviews" can ever have anything in it for this person. */
      on_panels: panelSeats > 0,
      watching,
      /** The three figures on the page header. `delta` is null when there is
       *  no comparable prior window — better an absent delta than a made-up one. */
      head_stats: {
        in_flight: activeApplications.length,
        // Applications opened in the last 7 days. Labelled "this week" because
        // that is exactly what it counts — we keep no daily snapshots.
        in_flight_delta: activeApplications.filter(
          (a) => now - a.createdAt.getTime() <= 7 * DAY,
        ).length,
        median_time_to_offer_days: medianTto === null ? null : Math.round(medianTto),
        median_time_to_offer_delta:
          medianRecent !== null && medianPrior !== null
            ? Math.round(medianRecent - medianPrior)
            : null,
        sla_breached: slaBreached,
        // Items that crossed their threshold since Monday: still breached now,
        // but not yet breached at the start of the week.
        sla_breached_delta: breachedSinceMonday,
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
        /** Cross-team history is why InterVU exists — surface it before the
         *  interview, not after. */
        prep: rejectedBefore.has(i.application.candidateId)
          ? "Prior reject — read"
          : "Dossier ready",
        prep_tone: rejectedBefore.has(i.application.candidateId) ? "warn" : "ok",
      })),
      recent_submissions: recentSubmissions.map((s) => ({
        id: s.id,
        candidate: s.candidate
          ? {
              id: s.candidate.id,
              displayName: s.candidate.displayName,
              /** "Backend Engineer @ Volta" — who they are today. */
              title: [s.candidate.currentTitle, s.candidate.currentEmployer]
                .filter(Boolean)
                .join(" @ "),
            }
          : null,
        /** The name as the agency typed it. A submission parked for a match
         *  review has no candidate yet, and the row used to show no name at all. */
        submitted_name:
          (s.rawProfile as { candidate_name?: string } | null)?.candidate_name ?? null,
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
