import type { Permission } from "./permissions";

export interface Grant {
  permissions: readonly Permission[];
  /** "org" = org-wide grant; otherwise the expanded subtree of the scope node. */
  unitIds: "org" | readonly string[];
}

/**
 * A user's effective access: the union of their grants, with scope
 * inheritance already expanded (docs/09-entitlements.md §3).
 * Pure and framework-free — unit-testable without a DB.
 */
export class Access {
  constructor(private readonly grants: readonly Grant[]) {}

  /** Units where `permission` applies; "org" short-circuits to everything. */
  unitIdsFor(permission: Permission): "org" | string[] {
    const ids = new Set<string>();
    for (const g of this.grants) {
      if (!g.permissions.includes(permission)) continue;
      if (g.unitIds === "org") return "org";
      for (const id of g.unitIds) ids.add(id);
    }
    return [...ids];
  }

  /** Can the user exercise `permission` (optionally: on a specific unit)? */
  can(permission: Permission, unitId?: string): boolean {
    const scope = this.unitIdsFor(permission);
    if (scope === "org") return true;
    if (unitId === undefined) return scope.length > 0;
    return scope.includes(unitId);
  }

  /**
   * May the user hand out access AT `unitId` (null = org-wide)?
   *
   * Distinct from `can(permission, unitId)`: granting is the one operation
   * where the *absence* of a unit means "everywhere" rather than "anywhere",
   * so a unit-scoped admin must never satisfy it. Otherwise a team-level
   * admin could mint themselves an org-wide grant and escape their scope.
   */
  canGrantAt(permission: Permission, unitId: string | null): boolean {
    const scope = this.unitIdsFor(permission);
    if (scope === "org") return true;
    return unitId !== null && scope.includes(unitId);
  }
}

/** Expand each membership's scope node into its subtree. */
export function buildAccess(
  memberships: readonly { orgUnitId: string | null; permissions: readonly Permission[] }[],
  units: readonly { id: string; parentId: string | null }[],
): Access {
  const childrenOf = new Map<string | null, string[]>();
  for (const u of units) {
    const list = childrenOf.get(u.parentId) ?? [];
    list.push(u.id);
    childrenOf.set(u.parentId, list);
  }
  const subtree = (rootId: string): string[] => {
    const out: string[] = [];
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift()!;
      out.push(id);
      queue.push(...(childrenOf.get(id) ?? []));
    }
    return out;
  };
  return new Access(
    memberships.map((m) => ({
      permissions: m.permissions,
      unitIds: m.orgUnitId === null ? ("org" as const) : subtree(m.orgUnitId),
    })),
  );
}
