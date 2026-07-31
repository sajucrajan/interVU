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
