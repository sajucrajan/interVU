import { Controller, Get, Query } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant, VendorScope } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import {
  benchmark,
  parseWindow,
  vendorFunnels,
  WINDOWS,
  type FunnelFilters,
} from "./vendor-funnel";

function filtersFrom(q: Record<string, string | undefined>): FunnelFilters {
  return {
    positionId: q.position || undefined,
    skill: q.skill || undefined,
    seniority: q.seniority || undefined,
  };
}

/** The filter values a UI can offer, so neither side invents its own list. */
async function filterOptions(prisma: PrismaService, organizationId: string) {
  const [positions, skills] = await Promise.all([
    prisma.position.findMany({
      where: { organizationId },
      select: { id: true, reference: true, title: true },
      orderBy: { reference: "asc" },
    }),
    prisma.skill.findMany({
      where: { organizationId },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    windows: Object.entries(WINDOWS).map(([key, w]) => ({ key, label: w.label })),
    positions,
    skills: skills.map((s) => s.name),
    seniorities: ["junior", "mid", "senior", "staff", "principal"],
  };
}

/**
 * The organization's view: every agency, side by side.
 *
 * `vendors.manage` rather than `positions.view`, because this is the screen a
 * contract gets renegotiated from — it is commercial, not operational.
 */
@Controller("analytics/vendors")
@OrgScope()
export class VendorAnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async vendors(
    @Tenant() tenant: TenantContext,
    @Query() query: Record<string, string | undefined>,
  ) {
    const organizationId = tenant.org!.organizationId;
    const access = await this.authz.access(tenant);
    this.authz.require(access, "vendors.manage");
    const window = parseWindow(query.window);
    return {
      window,
      window_label: WINDOWS[window].label,
      filters: filtersFrom(query),
      options: await filterOptions(this.prisma, organizationId),
      vendors: await vendorFunnels(this.prisma, {
        organizationId,
        window,
        filters: filtersFrom(query),
      }),
    };
  }
}

/**
 * The agency's view of itself: the same numbers, for one vendor.
 *
 * Rendered from the same computation as the controller above on purpose. A
 * vendor review where the agency and the client disagree about how many
 * candidates were even submitted spends its hour on reconciliation instead of
 * on the decision, and that disagreement is always an artefact of two
 * spreadsheets rather than a real dispute.
 *
 * The vendor's own id is forced in from the session, never read from the
 * query, so there is no parameter to tamper with. The benchmark comes from
 * every vendor's data but is pooled and suppressed below three peers — see
 * `benchmark`.
 */
@Controller("vendor/analytics")
@VendorScope()
export class VendorSelfAnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async mine(
    @Tenant() tenant: TenantContext,
    @Query() query: Record<string, string | undefined>,
  ) {
    const { organizationId, vendor } = tenant.vendor!;
    const window = parseWindow(query.window);
    const filters = filtersFrom(query);

    const vendorOrg = await this.prisma.vendorOrg.findFirst({
      where: { vendorId: vendor.id, organizationId },
      select: { id: true },
    });
    if (!vendorOrg) return { window, mine: null, benchmark: null };

    // Every vendor, because the benchmark needs them — then narrowed to this
    // one before anything leaves the method. `benchmark` returns pooled rates
    // only, and refuses entirely below three active peers.
    const all = await vendorFunnels(this.prisma, {
      organizationId,
      window,
      filters,
    });
    const mine = all.find((v) => v.vendor_org_id === vendorOrg.id) ?? null;

    return {
      window,
      window_label: WINDOWS[window].label,
      filters,
      options: await this.vendorFilterOptions(organizationId, vendorOrg.id),
      mine,
      benchmark: benchmark(all, vendorOrg.id),
    };
  }

  /**
   * Only the roles this vendor was actually released to. Offering the full
   * position list as a filter would disclose the client's whole requisition
   * book through a dropdown.
   */
  private async vendorFilterOptions(organizationId: string, vendorOrgId: string) {
    const [releases, skills] = await Promise.all([
      this.prisma.positionVendorRelease.findMany({
        where: { vendorOrgId, position: { organizationId } },
        select: {
          position: { select: { id: true, reference: true, title: true } },
        },
      }),
      this.prisma.skill.findMany({
        where: { organizationId },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      windows: Object.entries(WINDOWS).map(([key, w]) => ({ key, label: w.label })),
      positions: releases.map((r) => r.position),
      skills: skills.map((s) => s.name),
      seniorities: ["junior", "mid", "senior", "staff", "principal"],
    };
  }
}
