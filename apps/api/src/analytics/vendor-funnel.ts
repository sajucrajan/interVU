import type { PrismaService } from "../prisma/prisma.service";

/**
 * What happened to the candidates a vendor sent.
 *
 * ONE computation, deliberately, serving both the vendor portal and the
 * organization's vendor review. Vendor performance conversations fail in a
 * specific and boring way: the agency arrives with their spreadsheet, the
 * client arrives with theirs, the two disagree about how many candidates were
 * even submitted, and the next hour is spent reconciling instead of deciding.
 * If both screens are rendered from this file, that argument cannot start.
 *
 * The audiences differ only in WHICH vendors they may ask about — enforced by
 * the callers, not here — and in whether a benchmark is offered.
 *
 * Honest nulls throughout, following the principle already set in
 * performance.controller.ts: this is a screen people quote in fee
 * negotiations, so a plausible-looking approximation is worse than a blank.
 */

const DAY = 86_400_000;

/**
 * Windows people actually ask for. A quarter is 91 days rather than "the
 * current calendar quarter" because a rolling window can be compared with the
 * period immediately before it; a calendar quarter three days old cannot.
 */
export const WINDOWS = {
  "7d": { days: 7, label: "This week" },
  "30d": { days: 30, label: "This month" },
  "91d": { days: 91, label: "This quarter" },
  "182d": { days: 182, label: "Half year" },
  "365d": { days: 365, label: "This year" },
} as const;

export type WindowKey = keyof typeof WINDOWS;

export function parseWindow(raw?: string): WindowKey {
  return raw && raw in WINDOWS ? (raw as WindowKey) : "91d";
}

export interface FunnelFilters {
  /** A single role. */
  positionId?: string;
  /**
   * A technology, by skill name. The question is "how do they do on
   * Kubernetes roles", and a vendor strong at React and weak at platform work
   * looks merely average until you split it this way.
   */
  skill?: string;
  seniority?: string;
}

export interface Funnel {
  submitted: number;
  /** Survived the duplicate probe — someone else had not already sent them. */
  accepted: number;
  /** Reached screening or beyond. */
  screened: number;
  interviewed: number;
  offered: number;
  /** Lost to another vendor's earlier claim on the same candidate. */
  duplicate: number;
  /** Turned down before anyone spent an interview hour on them. */
  rejected_at_screening: number;
  rejected_after_interview: number;
  /** Still moving. Not a loss, and counting it as one flatters nobody. */
  in_flight: number;
}

export interface FunnelRates {
  /** accepted / submitted — are they sending people already in the pipeline? */
  accept: number | null;
  /**
   * interviewed / accepted. The signal-quality number: of the people they
   * introduced, how many were worth an hour. This is the one to argue about.
   */
  screen_through: number | null;
  /** offered / interviewed — did the panel agree with the screener? */
  offer: number | null;
  /** offered / submitted, the whole journey. */
  end_to_end: number | null;
}

export interface VendorFunnel {
  vendor_org_id: string;
  vendor: string;
  tier: number;
  funnel: Funnel;
  rates: FunnelRates;
  /** Same shape for the period immediately before, so a delta is honest. */
  previous: { funnel: Funnel; rates: FunnelRates } | null;
  /** Median days from submission to a first interview, when there are any. */
  median_days_to_interview: number | null;
  /** Where they are strong, by technology. Empty when nothing is filtered in. */
  by_skill: {
    skill: string;
    submitted: number;
    interviewed: number;
    offered: number;
    screen_through: number | null;
  }[];
}

const rate = (num: number, den: number): number | null =>
  den === 0 ? null : Math.round((num / den) * 1000) / 1000;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** The row shape the funnel is folded from. One query feeds every figure. */
interface Row {
  vendorOrgId: string;
  status: string;
  receivedAt: Date;
  positionSkills: string[];
  application: {
    currentStage: string;
    status: string;
    createdAt: Date;
    decision: { outcome: string } | null;
    interviewCount: number;
    firstInterviewAt: Date | null;
  } | null;
}

const STAGE_ORDER = ["submitted", "screening", "interviewing", "offer", "hired"];
const reached = (stage: string, target: string) =>
  STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(target);

function fold(rows: Row[]): { funnel: Funnel; rates: FunnelRates } {
  const f: Funnel = {
    submitted: rows.length,
    accepted: 0,
    screened: 0,
    interviewed: 0,
    offered: 0,
    duplicate: 0,
    rejected_at_screening: 0,
    rejected_after_interview: 0,
    in_flight: 0,
  };
  for (const r of rows) {
    if (r.status === "duplicate") f.duplicate++;
    if (r.status !== "accepted") continue;
    f.accepted++;
    const a = r.application;
    if (!a) continue;
    // An interview ROW or the stage: the same rule the decision gate uses, so
    // "interviewed" here means what it means everywhere else in the product.
    const interviewed = a.interviewCount > 0 || reached(a.currentStage, "interviewing");
    if (interviewed || reached(a.currentStage, "screening")) f.screened++;
    if (interviewed) f.interviewed++;
    if (a.decision?.outcome === "offer") f.offered++;
    if (a.decision?.outcome === "reject") {
      if (interviewed) f.rejected_after_interview++;
      else f.rejected_at_screening++;
    }
    if (!a.decision && a.status === "active") f.in_flight++;
  }
  return {
    funnel: f,
    rates: {
      accept: rate(f.accepted, f.submitted),
      screen_through: rate(f.interviewed, f.accepted),
      offer: rate(f.offered, f.interviewed),
      end_to_end: rate(f.offered, f.submitted),
    },
  };
}

/**
 * Load every submission in [from, to) that matches the filters.
 *
 * Deliberately one wide read folded in memory rather than a dozen aggregate
 * queries: the demo's whole corpus is a few hundred rows, and the funnel needs
 * the same rows sliced five different ways. When this stops being true the fix
 * is a materialised rollup, not five more round trips.
 */
async function loadRows(
  prisma: PrismaService,
  organizationId: string,
  from: Date,
  to: Date,
  filters: FunnelFilters,
  vendorOrgIds?: string[],
): Promise<Row[]> {
  const submissions = await prisma.submission.findMany({
    where: {
      organizationId,
      receivedAt: { gte: from, lt: to },
      ...(vendorOrgIds ? { vendorOrgId: { in: vendorOrgIds } } : {}),
      position: {
        ...(filters.positionId ? { id: filters.positionId } : {}),
        ...(filters.seniority ? { seniority: filters.seniority as never } : {}),
        ...(filters.skill
          ? { skills: { some: { skill: { name: filters.skill } } } }
          : {}),
      },
    },
    select: {
      id: true,
      vendorOrgId: true,
      status: true,
      receivedAt: true,
      position: { select: { skills: { select: { skill: { select: { name: true } } } } } },
    },
  });

  const applications = await prisma.application.findMany({
    where: {
      organizationId,
      sourceSubmissionId: { in: submissions.map((s) => s.id) },
    },
    select: {
      sourceSubmissionId: true,
      currentStage: true,
      status: true,
      createdAt: true,
      decision: { select: { outcome: true } },
      interviews: { select: { scheduledAt: true } },
    },
  });
  const bySubmission = new Map(applications.map((a) => [a.sourceSubmissionId, a]));

  return submissions.map((s) => {
    const a = bySubmission.get(s.id);
    const times = (a?.interviews ?? [])
      .map((i) => i.scheduledAt?.getTime())
      .filter((t): t is number => typeof t === "number")
      .sort((x, y) => x - y);
    return {
      vendorOrgId: s.vendorOrgId,
      status: s.status,
      receivedAt: s.receivedAt,
      positionSkills: s.position.skills.map((ps) => ps.skill.name),
      application: a
        ? {
            currentStage: a.currentStage,
            status: a.status,
            createdAt: a.createdAt,
            decision: a.decision,
            interviewCount: a.interviews.length,
            firstInterviewAt: times.length ? new Date(times[0]!) : null,
          }
        : null,
    };
  });
}

export interface FunnelQuery {
  organizationId: string;
  window: WindowKey;
  filters: FunnelFilters;
  /** Restrict to these vendors. Omit for every vendor in the organization. */
  vendorOrgIds?: string[];
  /** Anchor, so a test does not depend on the wall clock. */
  now?: Date;
}

export async function vendorFunnels(
  prisma: PrismaService,
  q: FunnelQuery,
): Promise<VendorFunnel[]> {
  const now = q.now ?? new Date();
  const span = WINDOWS[q.window].days * DAY;
  const from = new Date(now.getTime() - span);
  const prevFrom = new Date(from.getTime() - span);

  const [rows, prevRows, vendorOrgs] = await Promise.all([
    loadRows(prisma, q.organizationId, from, now, q.filters, q.vendorOrgIds),
    loadRows(prisma, q.organizationId, prevFrom, from, q.filters, q.vendorOrgIds),
    prisma.vendorOrg.findMany({
      where: {
        organizationId: q.organizationId,
        ...(q.vendorOrgIds ? { id: { in: q.vendorOrgIds } } : {}),
      },
      select: { id: true, tier: true, vendor: { select: { name: true } } },
    }),
  ]);

  return vendorOrgs
    .map((v) => {
      const mine = rows.filter((r) => r.vendorOrgId === v.id);
      const prevMine = prevRows.filter((r) => r.vendorOrgId === v.id);
      const { funnel, rates } = fold(mine);

      const daysToInterview = mine
        .filter((r) => r.application?.firstInterviewAt)
        .map(
          (r) =>
            (r.application!.firstInterviewAt!.getTime() - r.receivedAt.getTime()) / DAY,
        )
        .filter((d) => d >= 0);

      // Per technology. A vendor strong on React and weak on platform work
      // looks merely average until the numbers are split this way, which is
      // the whole reason anyone asks for a breakdown.
      const skills = new Map<string, Row[]>();
      for (const r of mine) {
        for (const s of new Set(r.positionSkills)) {
          skills.set(s, [...(skills.get(s) ?? []), r]);
        }
      }
      const by_skill = [...skills.entries()]
        .map(([skill, rs]) => {
          const f = fold(rs).funnel;
          return {
            skill,
            submitted: f.submitted,
            interviewed: f.interviewed,
            offered: f.offered,
            screen_through: rate(f.interviewed, f.accepted),
          };
        })
        .sort((a, b) => b.submitted - a.submitted);

      return {
        vendor_org_id: v.id,
        vendor: v.vendor.name,
        tier: v.tier,
        funnel,
        rates,
        previous: prevMine.length ? fold(prevMine) : null,
        median_days_to_interview: median(daysToInterview.map((d) => Math.round(d * 10) / 10)),
        by_skill,
      };
    })
    .sort((a, b) => b.funnel.submitted - a.funnel.submitted);
}

/**
 * How everyone ELSE did, for a vendor to measure themselves against.
 *
 * Suppressed below three other vendors with data. With two, "the others'
 * average" is arithmetic one subtraction away from a named competitor's
 * numbers, and a benchmark that leaks a rival's conversion rate is a breach
 * dressed as a feature. Returning null and saying why is the honest option.
 */
export const MIN_PEERS_FOR_BENCHMARK = 3;

export function benchmark(all: VendorFunnel[], meId: string) {
  const peers = all.filter((v) => v.vendor_org_id !== meId && v.funnel.submitted > 0);
  if (peers.length < MIN_PEERS_FOR_BENCHMARK) {
    return {
      available: false as const,
      peer_count: peers.length,
      reason:
        `A comparison needs at least ${MIN_PEERS_FOR_BENCHMARK} other agencies ` +
        `active in this period. With fewer, the average would identify them.`,
    };
  }
  const total = peers.reduce(
    (acc, v) => ({
      submitted: acc.submitted + v.funnel.submitted,
      accepted: acc.accepted + v.funnel.accepted,
      interviewed: acc.interviewed + v.funnel.interviewed,
      offered: acc.offered + v.funnel.offered,
    }),
    { submitted: 0, accepted: 0, interviewed: 0, offered: 0 },
  );
  return {
    available: true as const,
    peer_count: peers.length,
    /** Pooled, not a mean of rates — a mean of rates lets one tiny agency
     *  with a single lucky placement dominate the comparison. */
    rates: {
      accept: rate(total.accepted, total.submitted),
      screen_through: rate(total.interviewed, total.accepted),
      offer: rate(total.offered, total.interviewed),
      end_to_end: rate(total.offered, total.submitted),
    },
  };
}
