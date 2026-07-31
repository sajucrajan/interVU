import type { OrgRole, OrgUser, Vendor, VendorUser } from "@prisma/client";

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
    memberships: { role: OrgRole; orgUnitId: string | null }[];
  };
  vendor?: {
    vendor: Vendor;
    user: VendorUser;
  };
}

export const TENANT_CONTEXT_KEY = "intervuTenantContext";
