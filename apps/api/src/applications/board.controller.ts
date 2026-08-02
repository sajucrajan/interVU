import { Body, Controller, Get, Post } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { SlaService } from "../sla/sla.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { ApplicationsService } from "./applications.service";

const STAGES = ["submitted", "screening", "interviewing", "offer"] as const;

/** Which SLA clock governs a card sitting in each stage. */
const STAGE_SLA = {
  submitted: "first_screen",
  screening: "first_screen",
  interviewing: "decision_due",
  offer: "decision_due",
} as const;

const BulkTransition = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  to_stage: z.enum(STAGES),
  note: z.string().max(500).optional(),
});

/** Vendor-sourced cards still show the agency; the rest name their channel. */
const SOURCE_LABEL: Record<string, string> = {
  careers: "Careers site",
  referral: "Referral",
  internal: "Internal",
  vendor: "Vendor",
  import: "Import",
};

/**
 * Everything the pipeline board renders, in one call: the cards with their
 * age and flags, the saved-view counts, and the per-stage WIP caps.
 *
 * A card's age comes from its latest stage transition, so "11d" means eleven
 * days in THIS stage rather than eleven days since it arrived.
 */
@Controller("pipeline")
@OrgScope()
export class BoardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly sla: SlaService,
    private readonly applications: ApplicationsService,
  ) {}

  @Get("board")
  async board(@Tenant() tenant: TenantContext) {
    const organizationId = tenant.org!.organizationId;
    const access = await this.authz.access(tenant);
    this.authz.require(access, "submissions.view");
    const scope = access.unitIdsFor("submissions.view");
    const byPosition = scope === "org" ? {} : { position: { orgUnitId: { in: scope } } };
    const now = Date.now();

    const [rows, org, thresholds] = await Promise.all([
      this.prisma.application.findMany({
        where: { organizationId, status: "active", ...byPosition },
        select: {
          id: true,
          currentStage: true,
          createdAt: true,
          candidateId: true,
          sourceSubmissionId: true,
          sourceChannel: true,
          candidate: { select: { id: true, displayName: true } },
          position: { select: { id: true, title: true, reference: true } },
          interviews: { select: { status: true } },
          decision: { select: { outcome: true } },
          offer: { select: { vsRateBand: true } },
          stageTransitions: { orderBy: { at: "desc" }, take: 1, select: { at: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      }),
      this.sla.thresholds(organizationId),
    ]);

    const submissions = await this.prisma.submission.findMany({
      where: { id: { in: rows.map((r) => r.sourceSubmissionId).filter((id): id is string => id !== null) } },
      select: {
        id: true,
        ownershipStatus: true,
        vendorOrg: { select: { vendor: { select: { name: true } } } },
      },
    });
    const subById = new Map(submissions.map((s) => [s.id, s]));

    // A candidate the organization has seen before on another requisition —
    // the cross-team history signal, surfaced on the card rather than buried
    // in the dossier.
    const counts = await this.prisma.application.groupBy({
      by: ["candidateId"],
      where: { organizationId, candidateId: { in: rows.map((r) => r.candidateId) } },
      _count: true,
    });
    const appsPerCandidate = new Map(counts.map((c) => [c.candidateId, c._count]));

    const cards = rows.map((r) => {
      const enteredAt = r.stageTransitions[0]?.at ?? r.createdAt;
      const ageHours = SlaService.hoursSince(enteredAt, now);
      const threshold = thresholds[STAGE_SLA[r.currentStage as keyof typeof STAGE_SLA]];
      const ageState = SlaService.state(ageHours, threshold);
      const sub = r.sourceSubmissionId ? subById.get(r.sourceSubmissionId) : undefined;
      const done = r.interviews.filter((i) => i.status === "completed").length;
      const total = r.interviews.length;
      const decisionDue = total > 0 && done === total && !r.decision;

      const flags: { label: string; tone: "bad" | "warn" | "ok" }[] = [];
      if (ageState === "breached") flags.push({ label: "SLA breached", tone: "bad" });
      if (sub?.ownershipStatus === "duplicate") flags.push({ label: "Duplicate", tone: "warn" });
      if (decisionDue) flags.push({ label: "Decision due", tone: "bad" });
      // An offer above the advertised band is a fact a hiring manager should
      // see on the card, not discover in a spreadsheet later.
      if (r.offer?.vsRateBand === "above") {
        flags.push({ label: "Above band", tone: "warn" });
      }
      if ((appsPerCandidate.get(r.candidateId) ?? 1) > 1) {
        flags.push({ label: "Re-applicant", tone: "warn" });
      }

      return {
        id: r.id,
        stage: r.currentStage,
        candidate: r.candidate,
        position_reference: r.position.reference,
        position_title: r.position.title,
        position_id: r.position.id,
        entered_stage_at: enteredAt,
        age_hours: ageHours,
        age_state: ageState,
        interviews_label: total === 0 ? "not scheduled" : `${done}/${total} interviews`,
        vendor: sub?.vendorOrg.vendor.name ?? "—",
        // The SOURCE column reads the channel, not the vendor: a direct
        // applicant has no vendor, and rendering "—" there loses the fact
        // that they came through the careers site at all.
        source_channel: r.sourceChannel,
        source: SOURCE_LABEL[r.sourceChannel] ?? r.sourceChannel,
        flags,
        /** Blocked or late work carries a texture, not only a colour. */
        hatched: ageState === "breached" || sub?.ownershipStatus === "duplicate",
      };
    });

    const wipCaps =
      ((org?.settings as { wip_caps?: Record<string, number> })?.wip_caps) ?? {};

    const columns = STAGES.map((stage) => {
      const inStage = cards.filter((c) => c.stage === stage);
      const cap = wipCaps[stage] ?? null;
      return {
        stage,
        count: inStage.length,
        cap,
        /** over = past the cap, ok = under it, none = no cap set. */
        wip: cap === null ? "none" : inStage.length > cap ? "over" : "ok",
        cards: inStage,
      };
    });

    // Contested submissions are BLOCKED at intake, so they never become
    // applications — counting cards would always report zero. The duplicates
    // view is a different population and needs its own query.
    const contested = await this.prisma.submission.findMany({
      where: { organizationId, ownershipStatus: "duplicate", ...byPosition },
      select: {
        id: true,
        receivedAt: true,
        candidate: { select: { id: true, displayName: true } },
        position: { select: { id: true, title: true, reference: true } },
        vendorOrg: { select: { vendor: { select: { name: true } } } },
      },
      orderBy: { receivedAt: "desc" },
    });

    // Who actually holds each contested (candidate, position) pair, so the
    // arbitration is readable: today only the loser is named.
    const owners = await this.prisma.submission.findMany({
      where: {
        organizationId,
        // The explicit owner, or — where ownership was never contested at the
        // time — the earliest submission that was not itself blocked. That is
        // the rule the arbitration actually applies.
        ownershipStatus: { in: ["owner", "not_applicable"] },
        candidateId: { in: contested.map((c) => c.candidate?.id ?? "") },
      },
      orderBy: { receivedAt: "asc" },
      select: {
        candidateId: true,
        positionId: true,
        receivedAt: true,
        vendorOrg: { select: { vendor: { select: { name: true } } } },
      },
    });
    const ownerFor = new Map<string, (typeof owners)[number]>();
    for (const o of owners) {
      const key = `${o.candidateId}:${o.positionId}`;
      if (!ownerFor.has(key)) ownerFor.set(key, o); // earliest wins
    }

    const windowDays =
      ((org?.settings as { ownership_window_days?: number })?.ownership_window_days) ?? 180;

    const duplicateRows = contested.map((s) => {
      const owner = s.candidate
        ? ownerFor.get(`${s.candidate.id}:${s.position.id}`)
        : undefined;
      return {
        id: s.id,
        candidate: s.candidate,
        position_id: s.position.id,
        position_reference: s.position.reference,
        position_title: s.position.title,
        blocked_vendor: s.vendorOrg.vendor.name,
        received_at: s.receivedAt,
        winning_vendor: owner?.vendorOrg.vendor.name ?? null,
        window_expires_at: owner
          ? new Date(owner.receivedAt.getTime() + windowDays * 86_400_000)
          : null,
      };
    });

    const breached = cards.filter((c) => c.age_state === "breached").length;
    const duplicates = duplicateRows.length;

    return {
      total: cards.length,
      columns,
      duplicates: duplicateRows,
      // The four existing filter chips become the default saved views, plus
      // the one the design adds.
      views: [
        { key: "all", label: "All active", count: cards.length },
        {
          key: "unscreened",
          label: "New to screen",
          count: cards.filter((c) => c.stage === "submitted").length,
        },
        {
          key: "awaiting_decision",
          label: "Awaiting decision",
          count: cards.filter((c) => c.flags.some((f) => f.label === "Decision due")).length,
        },
        { key: "sla_breached", label: "SLA breached", count: breached, tone: "bad" },
        { key: "duplicates", label: "Duplicates", count: duplicates },
      ],
    };
  }

  /**
   * Move several candidates at once.
   *
   * Per-item, not all-or-nothing: one card failing an entitlement check or a
   * stage guard must not silently roll back the other forty-nine. Each result
   * reports its own outcome.
   */
  @Post("bulk/transition")
  async bulkTransition(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(BulkTransition, body);
    const access = await this.authz.access(tenant);
    const { organizationId, user } = tenant.org!;

    const results = [];
    for (const id of input.ids) {
      try {
        await this.applications.transition(organizationId, id, access, user.id, {
          to_stage: input.to_stage,
          note: input.note,
        });
        results.push({ id, ok: true });
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: (e as { response?: { detail?: string }; message?: string }).response?.detail ??
            (e as Error).message,
        });
      }
    }
    return {
      moved: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }
}
