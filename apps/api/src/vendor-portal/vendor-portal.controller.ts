import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
} from "@nestjs/common";
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

  /**
   * 404, not 403, when the role was never released to this vendor. A vendor
   * should not be able to confirm that a position exists at all by watching
   * which id gives a different error — the release ladder is a commercial
   * arrangement between the organization and each agency separately.
   */
  @Get("positions/:id")
  async position(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const position = await this.portal.releasedPosition(
      tenant.vendor!.vendor.id,
      tenant.vendor!.organizationId,
      id,
    );
    if (!position) throw new NotFoundException("Position not found");
    return position;
  }
}
