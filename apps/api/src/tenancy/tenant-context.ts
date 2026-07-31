import type { OrgUser, Vendor, VendorUser } from "@prisma/client";

/**
 * Resolved per-request identity + tenancy scope. Exactly one side is set:
 * org routes require `org`, vendor routes require `vendor`.
 * (docs/02-architecture.md §4)
 */
export interface TenantContext {
  org?: {
    organizationId: string;
    user: OrgUser;
    roles: string[];
  };
  vendor?: {
    vendor: Vendor;
    user: VendorUser;
  };
}

export const TENANT_CONTEXT_KEY = "intervuTenantContext";
