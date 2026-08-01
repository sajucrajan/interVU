import type { OrgMembership, Role } from "@prisma/client";
import { sanitizePermissions } from "./permissions";
import type { ResolvedMembership } from "../tenancy/tenant-context";

/**
 * Turn stored grants into the shape the authorization layer wants, with each
 * role's permissions resolved. Shared by both context builders (real sessions
 * and dev headers) so the two can never drift apart.
 *
 * Permissions are sanitized on the way out: a role that still stores a
 * permission the code has since removed grants nothing.
 */
export function resolveMemberships(
  memberships: (OrgMembership & { role: Role })[],
): ResolvedMembership[] {
  return memberships.map((m) => ({
    roleId: m.roleId,
    roleKey: m.role.key,
    roleName: m.role.name,
    permissions: sanitizePermissions(m.role.permissions),
    orgUnitId: m.orgUnitId,
  }));
}

/** Prisma include that gives `resolveMemberships` what it needs. */
export const WITH_ROLES = { memberships: { include: { role: true } } } as const;
