import type { OrgUser, Vendor, VendorUser } from "@prisma/client";
import type { Permission } from "../entitlements/permissions";

/**
 * One `role @ scope` grant, with the role's permissions already resolved.
 * Roles are rows now, so the permission list travels with the membership
 * rather than being looked up from a compile-time table.
 */
export interface ResolvedMembership {
  roleId: string;
  roleKey: string;
  roleName: string;
  permissions: Permission[];
  orgUnitId: string | null;
}

/**
 * Resolved per-request identity + tenancy scope. Exactly one side is set:
 * org routes require `org`, vendor routes require `vendor`.
 * Tenancy answers WHO (docs/02 §4); entitlements answer WHAT
 * (docs/09-entitlements.md) via AuthzService over `memberships`.
 */
export interface TenantContext {
  org?: {
    organizationId: string;
    user: OrgUser;
    memberships: ResolvedMembership[];
  };
  /**
   * Vendor sessions are org-scoped: a vendor serving several organizations
   * signs in per organization, and every vendor query filters on BOTH ids
   * so one session can never span organizations (docs/05 §1).
   */
  vendor?: {
    vendor: Vendor;
    user: VendorUser;
    organizationId: string;
  };
}

export const TENANT_CONTEXT_KEY = "intervuTenantContext";
