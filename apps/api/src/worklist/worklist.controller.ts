import { Controller, Get } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

export interface WorkItemGroup {
  key: string;
  label: string;
  count: number;
  href: string;
  tone: "critical" | "warning" | "normal";
}

/**
 * The signed-in user's action queue and pipeline health — the data behind the
 * workspace home and the notification bell. Every figure is filtered by the
 * viewer's entitlements (docs/09), so a team-scoped manager's "needs
 * attention" never counts another team's work.
 */
@Controller("me")
@OrgScope()
export class WorklistController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Get("worklist")
  async worklist(@Tenant() tenant: TenantContext) {
    const organizationId = tenant.org!.organizationId;
    const userId = tenant.org!.user.id;
    const access = await this.authz.access(tenant);

    const viewScope = access.unitIdsFor("submissions.view");
    const inScope =
      viewScope === "org" ? {} : { position: { orgUnitId: { in: viewScope } } };
    const canReview = access.can("candidates.merge");
    const canArbitrate = access.can("submissions.arbitrate");
    const canDecide = access.can("decisions.record");
    const canTransition = access.can("applications.transition");

    const [
      matchReviews,
      duplicateContests,
      myScorecardsDue,
      awaitingDecision,
      unscreened,
      upcomingInterviews,
      stageRows,
      recentSubmissions,
    ] = await Promise.all([
      canReview
        ? this.prisma.matchReviewItem.count({
            where: { organizationId, status: "open" },
          })
        : 0,
      canArbitrate
        ? this.prisma.submission.count({
            where: { organizationId, ownershipStatus: "duplicate", ...inScope },
          })
        : 0,
      // Interviews I'm on the panel of that still lack MY scorecard.
      this.prisma.interview.count({
        where: {
          organizationId,
          panelists: { some: { orgUserId: userId } },
          scorecards: { none: { orgUserId: userId } },
          status: { in: ["scheduled", "completed"] },
        },
      }),
      // Everyone interviewed, nobody decided.
      canDecide
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
      canTransition
        ? this.prisma.application.count({
            where: {
              organizationId,
              status: "active",
              currentStage: "submitted",
              ...inScope,
            },
          })
        : 0,
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
            },
          },
          scorecards: { where: { orgUserId: userId }, select: { id: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 5,
      }),
      this.prisma.application.groupBy({
        by: ["currentStage"],
        where: { organizationId, status: "active", ...inScope },
        _count: true,
      }),
      this.prisma.submission.findMany({
        where: { organizationId, ...inScope },
        include: {
          candidate: { select: { id: true, displayName: true } },
          position: { select: { title: true } },
          vendorOrg: { select: { vendor: { select: { name: true } } } },
        },
        orderBy: { receivedAt: "desc" },
        take: 6,
      }),
    ]);

    const groups: WorkItemGroup[] = (
      [
        {
          key: "scorecards",
          label: "Interviews awaiting your scorecard",
          count: myScorecardsDue,
          href: "/interviews",
          tone: "critical",
        },
      {
        key: "match_reviews",
        label: "Identity matches to review",
        count: matchReviews,
        href: "/match-reviews",
        tone: "warning",
      },
      {
        key: "duplicates",
        label: "Duplicate submission contests",
        count: duplicateContests,
        href: "/pipeline?filter=duplicates",
        tone: "warning",
      },
      {
        key: "decisions",
        label: "Candidates awaiting a decision",
        count: awaitingDecision,
        href: "/pipeline?filter=awaiting_decision",
        tone: "critical",
      },
        {
          key: "unscreened",
          label: "New submissions to screen",
          count: unscreened,
          href: "/pipeline?filter=unscreened",
          tone: "normal",
        },
      ] as WorkItemGroup[]
    ).filter((g) => g.count > 0);

    const STAGE_ORDER = ["submitted", "screening", "interviewing", "offer"];
    const pipeline = STAGE_ORDER.map((stage) => ({
      stage,
      count: stageRows.find((r) => r.currentStage === stage)?._count ?? 0,
    }));

    return {
      user: { name: tenant.org!.user.name, roles: [...new Set(tenant.org!.memberships.map((m) => m.role))] },
      total: groups.reduce((n, g) => n + g.count, 0),
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
        vendor: s.vendorOrg.vendor.name,
        status: s.status,
        ownership_status: s.ownershipStatus,
        received_at: s.receivedAt,
      })),
    };
  }
}
