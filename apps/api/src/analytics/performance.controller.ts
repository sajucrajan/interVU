import { Controller, Get, Query } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { SlaService, median } from "../sla/sla.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

const DAY = 86_400_000;
const RANGES = { "30d": 30, "90d": 90, "12mo": 365 } as const;
type RangeKey = keyof typeof RANGES;

const STAGE_ORDER = ["submitted", "screening", "interviewing", "offer"];
const SPARK_BUCKETS = 10;

/** Split a window into equal buckets and reduce each one. */
function sparkline<T>(
  rows: T[],
  at: (row: T) => number,
  from: number,
  to: number,
  reduce: (bucket: T[]) => number | null,
): (number | null)[] {
  const width = (to - from) / SPARK_BUCKETS;
  return Array.from({ length: SPARK_BUCKETS }, (_, i) => {
    const lo = from + i * width;
    const hi = lo + width;
    return reduce(rows.filter((r) => at(r) >= lo && at(r) < hi));
  });
}

/**
 * The exec view behind screen 1d.
 *
 * Answers "are we hiring fast enough, and which vendors are worth the fee" —
 * a different question from `/analytics/overview`, which answers "how many".
 * Every figure is scoped by the viewer's entitlements.
 *
 * Two of the design's figures are NOT computable yet and are returned as null
 * rather than approximated: offer ACCEPTANCE and candidate DROPOUT are not
 * modelled (handoff items #16 and #7). A plausible-looking number here would
 * be worse than an honest blank, because this is the screen people quote in
 * vendor negotiations.
 */
@Controller("analytics")
@OrgScope()
export class PerformanceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly sla: SlaService,
  ) {}

  @Get("performance")
  async performance(@Tenant() tenant: TenantContext, @Query("range") rangeQ?: string) {
    const organizationId = tenant.org!.organizationId;
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.view");
    const scope = access.unitIdsFor("positions.view");
    const byPosition =
      scope === "org" ? {} : { position: { orgUnitId: { in: scope } } };
    const positionWhere =
      scope === "org"
        ? { organizationId }
        : { organizationId, orgUnitId: { in: scope } };

    const range: RangeKey = (rangeQ as RangeKey) in RANGES ? (rangeQ as RangeKey) : "90d";
    const days = RANGES[range];
    const now = Date.now();
    const from = now - days * DAY;
    const priorFrom = from - days * DAY;

    const thresholds = await this.sla.thresholds(organizationId);

    const [applications, submissions, decisions, releases, positions, units] =
      await Promise.all([
        this.prisma.application.findMany({
          where: { organizationId, ...byPosition },
          select: {
            id: true,
            currentStage: true,
            status: true,
            createdAt: true,
            positionId: true,
            sourceSubmissionId: true,
            position: { select: { orgUnitId: true } },
            decision: { select: { outcome: true, decidedAt: true } },
            interviews: { select: { status: true } },
            stageTransitions: {
              orderBy: { at: "asc" },
              select: { toStage: true, at: true },
            },
          },
        }),
        this.prisma.submission.findMany({
          where: { organizationId, ...byPosition },
          select: {
            id: true,
            receivedAt: true,
            status: true,
            ownershipStatus: true,
            positionId: true,
            vendorOrgId: true,
          },
        }),
        this.prisma.decision.findMany({
          where: { organizationId, application: { ...byPosition } },
          select: {
            outcome: true,
            decidedAt: true,
            application: { select: { createdAt: true } },
          },
        }),
        this.prisma.positionVendorRelease.findMany({
          where: { position: positionWhere },
          select: { positionId: true, visibleFrom: true },
        }),
        this.prisma.position.findMany({
          where: positionWhere,
          select: {
            id: true,
            status: true,
            openings: true,
            orgUnitId: true,
          },
        }),
        this.prisma.orgUnit.findMany({
          where: { organizationId },
          select: { id: true, name: true, kind: true },
        }),
      ]);

    const vendorOrgs = await this.prisma.vendorOrg.findMany({
      where: { organizationId },
      select: {
        id: true,
        tier: true,
        createdAt: true,
        vendor: { select: { name: true } },
      },
    });

    const inWindow = (d: Date) => d.getTime() >= from;
    const inPrior = (d: Date) => d.getTime() >= priorFrom && d.getTime() < from;

    // ---- hero 1: median days to an offer decision -------------------------
    const offerDecisions = decisions.filter((d) => d.outcome === "offer");
    const daysToOffer = (d: (typeof offerDecisions)[number]) =>
      (d.decidedAt.getTime() - d.application.createdAt.getTime()) / DAY;
    const t2oNow = median(offerDecisions.filter((d) => inWindow(d.decidedAt)).map(daysToOffer));
    const t2oPrior = median(offerDecisions.filter((d) => inPrior(d.decidedAt)).map(daysToOffer));

    // ---- hero 2: release → first submission --------------------------------
    const firstReleaseByPosition = new Map<string, number>();
    for (const r of releases) {
      const t = r.visibleFrom.getTime();
      const cur = firstReleaseByPosition.get(r.positionId);
      if (cur === undefined || t < cur) firstReleaseByPosition.set(r.positionId, t);
    }
    const firstSubByPosition = new Map<string, number>();
    for (const s of submissions) {
      const t = s.receivedAt.getTime();
      const cur = firstSubByPosition.get(s.positionId);
      if (cur === undefined || t < cur) firstSubByPosition.set(s.positionId, t);
    }
    const ttfsRows = [...firstReleaseByPosition.entries()]
      .filter(([id]) => firstSubByPosition.has(id))
      .map(([id, rel]) => ({ at: rel, days: (firstSubByPosition.get(id)! - rel) / DAY }))
      .filter((r) => r.days >= 0);
    const ttfsNow = median(ttfsRows.filter((r) => r.at >= from).map((r) => r.days));
    const ttfsPrior = median(
      ttfsRows.filter((r) => r.at >= priorFrom && r.at < from).map((r) => r.days),
    );

    // ---- hero 4: duplicates blocked ---------------------------------------
    const dupes = submissions.filter((s) => s.ownershipStatus === "duplicate");
    const dupNow = dupes.filter((s) => inWindow(s.receivedAt)).length;
    const dupPrior = dupes.filter((s) => inPrior(s.receivedAt)).length;

    // ---- funnel: how many EVER reached each stage, and how long they sat ----
    const reached = (a: (typeof applications)[number], stage: string) => {
      if (a.stageTransitions.some((t) => t.toStage === stage)) return true;
      // Never moved, but is sitting there (or beyond) now.
      return STAGE_ORDER.indexOf(a.currentStage) >= STAGE_ORDER.indexOf(stage);
    };
    const dwellHours = (a: (typeof applications)[number], stage: string): number | null => {
      const entered =
        a.stageTransitions.find((t) => t.toStage === stage)?.at ??
        // Reached the stage without a transition row (seeded straight into it):
        // the clock starts when the application did.
        (stage === "submitted" || a.currentStage === stage ? a.createdAt : null);
      if (!entered) return null;
      const next = a.stageTransitions.find((t) => t.at.getTime() > entered.getTime());
      const end = next ? next.at.getTime() : now;
      return (end - entered.getTime()) / 3_600_000;
    };

    const funnel = STAGE_ORDER.map((stage) => {
      const rows = applications.filter((a) => reached(a, stage));
      const dwell = rows
        .map((a) => dwellHours(a, stage))
        .filter((h): h is number => h !== null);
      return {
        stage,
        count: rows.length,
        median_dwell_hours: median(dwell),
      };
    });
    // Hired needs an accepted offer, which is not modelled — see the class note.
    funnel.push({ stage: "hired", count: -1, median_dwell_hours: null });

    const worstLeak = funnel
      .slice(1, 4)
      .map((s, i) => {
        const prev = funnel[i]!;
        const kept = prev.count === 0 ? 1 : s.count / prev.count;
        return { from: prev.stage, to: s.stage, lost: 1 - kept, dwell: s.median_dwell_hours };
      })
      .sort((a, b) => b.lost - a.lost)[0];

    // ---- vendor quality index ---------------------------------------------
    const appBySubmission = new Map(applications.map((a) => [a.sourceSubmissionId, a]));
    const vendors = vendorOrgs
      .map((v) => {
        const subs = submissions.filter((s) => s.vendorOrgId === v.id);
        const accepted = subs.filter((s) => s.status === "accepted");
        const apps = accepted
          .map((s) => appBySubmission.get(s.id))
          .filter(Boolean) as (typeof applications)[number][];
        const interviewed = apps.filter((a) => reached(a, "interviewing")).length;
        const offered = apps.filter((a) => a.decision?.outcome === "offer").length;
        const acceptRate = subs.length ? accepted.length / subs.length : 0;
        const interviewRate = accepted.length ? interviewed / accepted.length : 0;
        const offerRate = interviewed ? offered / interviewed : 0;
        return {
          id: v.id,
          name: v.vendor.name,
          tier: v.tier,
          since: v.createdAt.getUTCFullYear(),
          submissions: subs.length,
          /** accept × interview × offer. NOT dropout-penalised: dropout is
           *  not modelled, so the design's penalty term cannot be applied. */
          quality: Math.round(acceptRate * interviewRate * offerRate * 100),
          offer_rate: subs.length ? offered / subs.length : 0,
          dropout_rate: null as number | null,
        };
      })
      .sort((a, b) => b.quality - a.quality);

    // ---- SLA breaches ------------------------------------------------------
    const overBy = (rows: number[], threshold: number) =>
      rows.length ? Math.max(...rows) - threshold : 0;

    const unscreenedAges = applications
      .filter((a) => a.status === "active" && a.currentStage === "submitted")
      .map((a) => SlaService.hoursSince(a.stageTransitions.at(-1)?.at ?? a.createdAt, now));
    const decisionAges = applications
      .filter(
        (a) =>
          a.status === "active" &&
          !a.decision &&
          a.interviews.some((i) => i.status === "completed"),
      )
      .map((a) => SlaService.hoursSince(a.stageTransitions.at(-1)?.at ?? a.createdAt, now));

    const breaches = [
      {
        key: "first_screen",
        label: `Screening SLA — no first review in ${thresholds.first_screen / 24}d`,
        count: unscreenedAges.filter((h) => h >= thresholds.first_screen).length,
        over_hours: overBy(
          unscreenedAges.filter((h) => h >= thresholds.first_screen),
          thresholds.first_screen,
        ),
        href: "/pipeline?filter=unscreened",
      },
      {
        key: "decision_due",
        label: "Decision SLA — all interviews complete",
        count: decisionAges.filter((h) => h >= thresholds.decision_due).length,
        over_hours: overBy(
          decisionAges.filter((h) => h >= thresholds.decision_due),
          thresholds.decision_due,
        ),
        href: "/pipeline?filter=awaiting_decision",
      },
    ].filter((b) => b.count > 0);

    // ---- demand vs supply, by team ----------------------------------------
    const teamName = new Map(units.map((u) => [u.id, u.name]));
    const demand = [...new Set(positions.map((p) => p.orgUnitId))]
      .map((unitId) => {
        const open = positions.filter((p) => p.orgUnitId === unitId && p.status === "open");
        const headcount = open.reduce((n, p) => n + p.openings, 0);
        const inFlight = applications.filter(
          (a) => a.status === "active" && a.position.orgUnitId === unitId,
        ).length;
        return {
          team: teamName.get(unitId) ?? "—",
          open_headcount: headcount,
          in_flight: inFlight,
        };
      })
      .filter((d) => d.open_headcount > 0 || d.in_flight > 0)
      .sort((a, b) => b.open_headcount - a.open_headcount);

    return {
      range,
      hero: {
        median_time_to_offer_days: t2oNow === null ? null : Math.round(t2oNow),
        median_time_to_offer_delta:
          t2oNow !== null && t2oPrior !== null ? Math.round(t2oNow - t2oPrior) : null,
        median_time_to_offer_spark: sparkline(
          offerDecisions.filter((d) => inWindow(d.decidedAt)),
          (d) => d.decidedAt.getTime(),
          from,
          now,
          (b) => median(b.map(daysToOffer)),
        ),
        time_to_first_submission_days: ttfsNow === null ? null : Number(ttfsNow.toFixed(1)),
        time_to_first_submission_delta:
          ttfsNow !== null && ttfsPrior !== null
            ? Number((ttfsNow - ttfsPrior).toFixed(1))
            : null,
        time_to_first_submission_spark: sparkline(
          ttfsRows.filter((r) => r.at >= from),
          (r) => r.at,
          from,
          now,
          (b) => median(b.map((r) => r.days)),
        ),
        /** Needs offer acceptance (item #16). Null, not a guess. */
        offer_accept_rate: null,
        offer_accept_rate_delta: null,
        duplicates_blocked: dupNow,
        duplicates_blocked_delta: dupNow - dupPrior,
        duplicates_blocked_spark: sparkline(
          dupes.filter((s) => inWindow(s.receivedAt)),
          (s) => s.receivedAt.getTime(),
          from,
          now,
          (b) => b.length,
        ),
      },
      funnel,
      leak: worstLeak
        ? {
            from: worstLeak.from,
            to: worstLeak.to,
            lost_pct: Math.round(worstLeak.lost * 100),
            dwell_days:
              worstLeak.dwell === null ? null : Number((worstLeak.dwell / 24).toFixed(1)),
          }
        : null,
      vendors,
      breaches,
      demand,
    };
  }
}
