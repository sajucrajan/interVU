import { Controller, Get, Query } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { median } from "../sla/sla.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

const DAY = 86_400_000;
const RANGES = { "30d": 30, "90d": 90, "12mo": 365 } as const;
type RangeKey = keyof typeof RANGES;

const CHANNELS = [
  { key: "careers", label: "Careers site", direct: true },
  { key: "referral", label: "Referral", direct: true },
  { key: "internal", label: "Internal", direct: true },
  { key: "vendor", label: "Vendor", direct: false },
  { key: "import", label: "Import", direct: true },
] as const;

/**
 * Channel comparison (design option 2c).
 *
 * The question this table exists to answer is not "how many did each channel
 * send" — it is "what did each channel COST per hire, and did those hires
 * stay". Volume rewards whoever sends the most resumes; the cost and retention
 * columns are what make a direct-vs-vendor argument settleable.
 *
 * Two columns are honest about missing inputs rather than approximated:
 * cost per hire is null until the vendor's contract carries a `fee_percent`,
 * and retention is null until a hire has a start date 90 days in the past.
 * A plausible-looking number in either column would be used to move budget.
 */
@Controller("analytics/channels")
export class ChannelsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  @OrgScope()
  async channels(@Tenant() ctx: TenantContext, @Query("range") range?: string) {
    const access = await this.authz.access(ctx);
    const units = access.unitIdsFor("submissions.view");
    const key: RangeKey = (
      range && range in RANGES ? range : "90d"
    ) as RangeKey;
    const from = new Date(Date.now() - RANGES[key] * DAY);
    const organizationId = ctx.org!.organizationId;

    const applications = await this.prisma.application.findMany({
      where: {
        organizationId,
        createdAt: { gte: from },
        ...(units === "org" ? {} : { position: { orgUnitId: { in: units } } }),
      },
      select: {
        id: true,
        createdAt: true,
        sourceChannel: true,
        currentStage: true,
        status: true,
        interviews: { select: { id: true }, take: 1 },
        decision: { select: { outcome: true, decidedAt: true } },
        offer: {
          select: {
            amount: true,
            acceptedAt: true,
            startDate: true,
            retained90d: true,
          },
        },
        sourceSubmissionId: true,
      },
    });

    // Application has no relation to its source submission — only the id —
    // so the vendor's fee is resolved in one extra query rather than a join.
    const feeBySubmission = new Map<string, number | null>(
      (
        await this.prisma.submission.findMany({
          where: {
            id: {
              in: applications
                .map((a) => a.sourceSubmissionId)
                .filter((id): id is string => !!id),
            },
          },
          select: { id: true, vendorOrg: { select: { feePercent: true } } },
        })
      ).map((s) => [
        s.id,
        s.vendorOrg.feePercent === null ? null : Number(s.vendorOrg.feePercent),
      ]),
    );

    const ninetyDaysAgo = new Date(Date.now() - 90 * DAY);

    const rows = CHANNELS.map((channel) => {
      const mine = applications.filter((a) => a.sourceChannel === channel.key);
      const interviewed = mine.filter((a) => a.interviews.length > 0);
      const hired = mine.filter((a) => a.status === "hired");

      // Days from application to the accepted offer — the only span a
      // candidate actually experiences.
      const days = hired
        .map((a) =>
          a.offer?.acceptedAt
            ? (a.offer.acceptedAt.getTime() - a.createdAt.getTime()) / DAY
            : null,
        )
        .filter((d): d is number => d !== null);

      // Cost is only known where BOTH the fee and the salary it applies to are
      // recorded. Averaging over the hires that happen to have both would
      // quietly under-report a channel; we report the coverage instead.
      const costed = hired
        .map((a) => {
          const fee = a.sourceSubmissionId
            ? feeBySubmission.get(a.sourceSubmissionId)
            : null;
          const base = a.offer?.amount;
          if (fee === null || fee === undefined || !base) return null;
          return (Number(base) * Number(fee)) / 100;
        })
        .filter((c): c is number => c !== null);
      // A direct channel with hires genuinely costs no placement fee. That is
      // a real zero, not a missing value, and it is the whole point of the row.
      const costPerHire = channel.direct
        ? hired.length
          ? 0
          : null
        : costed.length
          ? Math.round(costed.reduce((a, b) => a + b, 0) / costed.length)
          : null;

      // Only hires whose 90 days have actually elapsed can answer this.
      const mature = hired.filter(
        (a) => a.offer?.startDate && a.offer.startDate <= ninetyDaysAgo,
      );
      const retained = mature.filter((a) => a.offer?.retained90d === true);

      const pct = (n: number, d: number) =>
        d === 0 ? null : Math.round((n / d) * 100);

      return {
        key: channel.key,
        label: channel.label,
        direct: channel.direct,
        volume: mine.length,
        interview_rate: pct(interviewed.length, mine.length),
        hires: hired.length,
        hire_rate: pct(hired.length, mine.length),
        median_days_to_hire: days.length ? Math.round(median(days) ?? 0) : null,
        cost_per_hire: costPerHire,
        cost_basis: channel.direct
          ? hired.length
            ? "no placement fee"
            : null
          : costed.length < hired.length
            ? `${costed.length} of ${hired.length} hires have a fee on file`
            : null,
        retention_90d: pct(retained.length, mature.length),
        retention_basis: mature.length
          ? `${mature.length} hire${mature.length === 1 ? "" : "s"} past 90 days`
          : hired.length
            ? "no hire has reached 90 days yet"
            : null,
      };
    }).filter((r) => r.volume > 0);

    const total = rows.reduce((sum, r) => sum + r.volume, 0);

    return {
      range: key,
      total,
      /** Intake mix, so the table has a denominator on screen. */
      mix: rows.map((r) => ({
        key: r.key,
        label: r.label,
        share: total ? Math.round((r.volume / total) * 100) : 0,
      })),
      rows: rows.sort((a, b) => b.volume - a.volume),
    };
  }
}
