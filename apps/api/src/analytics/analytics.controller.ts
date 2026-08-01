import { Controller, Get } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

/**
 * Aggregates for the org analytics dashboard. Everything is scoped to the
 * viewer's entitlements: positions/submissions outside their unit scope are
 * excluded from every figure (docs/09 §6.2).
 */
@Controller("analytics")
@OrgScope()
export class AnalyticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Get("overview")
  async overview(@Tenant() tenant: TenantContext) {
    const organizationId = tenant.org!.organizationId;
    const access = await this.authz.access(tenant);
    const scope = access.unitIdsFor("positions.view");
    const positionWhere =
      scope === "org" ? { organizationId } : { organizationId, orgUnitId: { in: scope } };
    const viaPosition = scope === "org" ? {} : { position: { orgUnitId: { in: scope } } };

    const [
      openPositions,
      totalSubmissions,
      duplicatesBlocked,
      candidates,
      interviews,
      offers,
      applications,
      submissionsByVendor,
      units,
      positions,
      subsByPosition,
    ] = await Promise.all([
      this.prisma.position.count({ where: { ...positionWhere, status: "open" } }),
      this.prisma.submission.count({ where: { organizationId, ...viaPosition } }),
      this.prisma.submission.count({
        where: { organizationId, status: "duplicate", ...viaPosition },
      }),
      // Scope-aware: a team-scoped viewer counts only candidates who have an
      // application in their scope, so this figure agrees with every other
      // number on the page. Merged and erased records never count.
      this.prisma.candidate.count({
        where: {
          organizationId,
          mergedIntoId: null,
          erasedAt: null,
          ...(scope === "org"
            ? {}
            : { applications: { some: { position: { orgUnitId: { in: scope } } } } }),
        },
      }),
      this.prisma.interview.count({
        where: { organizationId, ...(scope === "org" ? {} : { application: { position: { orgUnitId: { in: scope } } } }) },
      }),
      this.prisma.decision.count({
        where: { organizationId, outcome: "offer", ...(scope === "org" ? {} : { application: { position: { orgUnitId: { in: scope } } } }) },
      }),
      this.prisma.application.findMany({
        where: { organizationId, ...(scope === "org" ? {} : { position: { orgUnitId: { in: scope } } }) },
        select: { currentStage: true, status: true },
      }),
      this.prisma.submission.groupBy({
        by: ["vendorOrgId", "status"],
        where: { organizationId, ...viaPosition },
        _count: true,
      }),
      this.prisma.orgUnit.findMany({
        where: { organizationId },
        select: { id: true, parentId: true, name: true, kind: true },
      }),
      this.prisma.position.findMany({
        where: positionWhere,
        select: { id: true, title: true, orgUnitId: true, status: true },
      }),
      this.prisma.submission.groupBy({
        by: ["positionId"],
        where: { organizationId, ...viaPosition },
        _count: true,
      }),
    ]);

    // Candidate leaves let the explorer drill all the way to a person.
    // Names only — consistent with what a read-only observer may see
    // (docs/09 §2); resumes, scorecards and history stay behind their own
    // permissions.
    const candidateRows = await this.prisma.submission.findMany({
      where: { organizationId, ...viaPosition },
      select: {
        positionId: true,
        candidateId: true,
        candidate: { select: { displayName: true } },
      },
    });

    // Skill matrix for the technology view (Java, Snowflake, Spring Boot…).
    const positionSkills = await this.prisma.positionSkill.findMany({
      where: { position: positionWhere },
      select: {
        positionId: true,
        level: true,
        skill: { select: { name: true } },
      },
    });

    // Funnel from application stages + decisions
    const funnel = {
      submitted: totalSubmissions - duplicatesBlocked,
      screening: applications.filter((a) => a.currentStage !== "submitted").length,
      interviewing: applications.filter((a) =>
        ["interviewing", "offer"].includes(a.currentStage),
      ).length,
      offer: offers,
      hired: applications.filter((a) => a.status === "hired").length,
    };

    // Vendor performance
    const vendorOrgs = await this.prisma.vendorOrg.findMany({
      where: { organizationId },
      include: { vendor: { select: { name: true } } },
    });
    const vendors = vendorOrgs.map((vo) => {
      const rows = submissionsByVendor.filter((r) => r.vendorOrgId === vo.id);
      const total = rows.reduce((n, r) => n + r._count, 0);
      const dup = rows.filter((r) => r.status === "duplicate").reduce((n, r) => n + r._count, 0);
      const accepted = rows
        .filter((r) => r.status === "accepted")
        .reduce((n, r) => n + r._count, 0);
      return {
        vendor: vo.vendor.name,
        tier: vo.tier,
        submissions: total,
        accepted,
        duplicates: dup,
        other: total - accepted - dup,
      };
    });
    vendors.sort((a, b) => b.submissions - a.submissions);

    // Hierarchy for the sunburst: unit tree with positions as leaves,
    // leaf value = submission count (min 1 so empty positions still render).
    const countByPosition = new Map(subsByPosition.map((r) => [r.positionId, r._count]));
    interface Node {
      name: string;
      kind: string;
      children?: Node[];
      value?: number;
    }

    // position → candidate → submission count
    const candidatesByPosition = new Map<string, Map<string, number>>();
    for (const row of candidateRows) {
      const name = row.candidate?.displayName ?? "(pending review)";
      const perPosition =
        candidatesByPosition.get(row.positionId) ?? new Map<string, number>();
      perPosition.set(name, (perPosition.get(name) ?? 0) + 1);
      candidatesByPosition.set(row.positionId, perPosition);
    }
    const build = (parentId: string | null): Node[] =>
      units
        .filter((u) => u.parentId === parentId)
        .map((u) => {
          const childUnits = build(u.id);
          const leafPositions: Node[] = positions
            .filter((p) => p.orgUnitId === u.id)
            .map((p) => {
              const people = candidatesByPosition.get(p.id);
              if (people && people.size > 0) {
                return {
                  name: p.title,
                  kind: "position",
                  children: [...people.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, value]) => ({ name, kind: "candidate", value })),
                };
              }
              // No submissions yet — keep the position visible as a thin leaf.
              return {
                name: p.title,
                kind: "position",
                value: Math.max(countByPosition.get(p.id) ?? 0, 1),
              };
            });
          return {
            name: u.name,
            kind: u.kind,
            children: [...childUnits, ...leafPositions],
          };
        })
        .filter((n) => (n.children?.length ?? 0) > 0);
    const hierarchy: Node = { name: "Organization", kind: "org", children: build(null) };

    // ---- Technology view: skill → position → candidate ----
    // A position requiring several skills appears under each of them, so
    // branch totals describe demand per technology and intentionally sum to
    // more than the submission count.
    const positionById = new Map(positions.map((p) => [p.id, p]));
    const bySkill = new Map<string, { positionId: string; level: string }[]>();
    for (const ps of positionSkills) {
      const list = bySkill.get(ps.skill.name) ?? [];
      list.push({ positionId: ps.positionId, level: ps.level });
      bySkill.set(ps.skill.name, list);
    }
    const skillChildren: Node[] = [...bySkill.entries()]
      .map(([skillName, entries]) => {
        const children: Node[] = entries
          .map(({ positionId, level }) => {
            const position = positionById.get(positionId);
            if (!position) return null;
            const people = candidatesByPosition.get(positionId);
            const label = `${position.title}${level === "must_have" ? " ★" : ""}`;
            if (people && people.size > 0) {
              return {
                name: label,
                kind: "position",
                children: [...people.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, value]) => ({ name, kind: "candidate", value })),
              } as Node;
            }
            return { name: label, kind: "position", value: 1 } as Node;
          })
          .filter((n): n is Node => n !== null);
        return { name: skillName, kind: "skill", children };
      })
      .filter((n) => (n.children?.length ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    const skillHierarchy: Node = {
      name: "All technologies",
      kind: "org",
      children: skillChildren,
    };

    return {
      totals: {
        open_positions: openPositions,
        candidates,
        submissions: totalSubmissions,
        duplicates_blocked: duplicatesBlocked,
        interviews,
        offers,
      },
      funnel,
      vendors,
      hierarchy,
      skill_hierarchy: skillHierarchy,
    };
  }
}
