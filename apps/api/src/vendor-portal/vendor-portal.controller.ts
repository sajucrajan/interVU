import { Controller, Get } from "@nestjs/common";
import { Tenant, VendorScope } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { VendorPortalService } from "./vendor-portal.service";

/**
 * Vendor-facing routes. Separate controller + sanitized DTOs by design:
 * vendor responses structurally cannot carry internal fields
 * (docs/06-api-design.md §3).
 */
@Controller("vendor")
@VendorScope()
export class VendorPortalController {
  constructor(private readonly portal: VendorPortalService) {}

  @Get("positions")
  positions(@Tenant() tenant: TenantContext) {
    return this.portal.visiblePositions(
      tenant.vendor!.vendor.id,
      tenant.vendor!.organizationId,
    );
  }
}
