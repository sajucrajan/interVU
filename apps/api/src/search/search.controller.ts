import { Controller, Get, Query } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

export interface SearchHit {
  kind: "candidate" | "position" | "vendor";
  id: string;
  label: string;
  hint: string;
  href: string;
}

const LIMIT_PER_KIND = 5;

/**
 * Backing store for the ⌘K palette.
 *
 * Filtering happens HERE, not in the client: a palette that fetches everything
 * and hides the rows a user may not see has already leaked them. Each kind is
 * gated on the permission that makes its destination usable, and candidates
 * and positions are additionally narrowed to the caller's unit scope.
 */
@Controller("search")
@OrgScope()
export class SearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async search(@Tenant() tenant: TenantContext, @Query("q") q?: string) {
    const organizationId = tenant.org!.organizationId;
    const term = (q ?? "").trim();
    if (term.length < 2) return { hits: [] as SearchHit[] };

    const access = await this.authz.access(tenant);
    const positionScope = access.unitIdsFor("positions.view");
    const submissionScope = access.unitIdsFor("submissions.view");

    const canSeePositions = access.can("positions.view");
    const canSeeCandidates =
      access.can("candidates.view_history") || access.can("submissions.view");
    const canSeeVendors = access.can("vendors.manage") || canSeePositions;

    const like = { contains: term, mode: "insensitive" as const };

    const [positions, candidates, vendors] = await Promise.all([
      canSeePositions
        ? this.prisma.position.findMany({
            where: {
              organizationId,
              ...(positionScope === "org"
                ? {}
                : { orgUnitId: { in: positionScope } }),
              OR: [{ title: like }, { reference: like }],
            },
            select: {
              id: true,
              title: true,
              reference: true,
              status: true,
              orgUnit: { select: { name: true } },
            },
            take: LIMIT_PER_KIND,
            orderBy: { createdAt: "desc" },
          })
        : [],
      canSeeCandidates
        ? this.prisma.candidate.findMany({
            where: {
              organizationId,
              // Never surface a merged-away or erased record: one is a
              // duplicate of another row, the other no longer legally exists.
              mergedIntoId: null,
              erasedAt: null,
              ...(submissionScope === "org"
                ? {}
                : {
                    applications: {
                      some: { position: { orgUnitId: { in: submissionScope } } },
                    },
                  }),
              OR: [
                { displayName: like },
                { currentEmployer: like },
                { identities: { some: { valueNorm: like } } },
              ],
            },
            select: {
              id: true,
              displayName: true,
              currentTitle: true,
              currentEmployer: true,
            },
            take: LIMIT_PER_KIND,
            orderBy: { updatedAt: "desc" },
          })
        : [],
      canSeeVendors
        ? this.prisma.vendorOrg.findMany({
            where: { organizationId, vendor: { name: like } },
            select: {
              id: true,
              tier: true,
              status: true,
              vendor: { select: { name: true } },
            },
            take: LIMIT_PER_KIND,
          })
        : [],
    ]);

    const hits: SearchHit[] = [
      ...candidates.map((c) => ({
        kind: "candidate" as const,
        id: c.id,
        label: c.displayName,
        hint: [c.currentTitle, c.currentEmployer].filter(Boolean).join(" · "),
        href: `/candidates/${c.id}`,
      })),
      ...positions.map((p) => ({
        kind: "position" as const,
        id: p.id,
        label: p.title,
        hint: [p.reference, p.orgUnit?.name, p.status].filter(Boolean).join(" · "),
        href: `/positions/${p.id}`,
      })),
      ...vendors.map((v) => ({
        kind: "vendor" as const,
        id: v.id,
        label: v.vendor.name,
        hint: `tier ${v.tier} · ${v.status}`,
        href: "/admin/vendors",
      })),
    ];

    return { hits };
  }
}
