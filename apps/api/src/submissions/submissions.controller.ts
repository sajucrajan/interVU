import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { VendorSubmissionCreate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { OrgScope, Tenant, VendorScope } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { SubmissionsService } from "./submissions.service";

/** Vendor-side submission routes (sanitized DTOs, docs/06 §3). */
@Controller("vendor")
@VendorScope()
export class VendorSubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post("positions/:id/submissions")
  submit(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) positionId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(VendorSubmissionCreate, body);
    return this.submissions.submit(
      {
        vendorId: tenant.vendor!.vendor.id,
        vendorUserId: tenant.vendor!.user.id,
        organizationId: tenant.vendor!.organizationId,
      },
      positionId,
      input,
    );
  }

  /**
   * The vendor confirms they have read the feedback. Scoped through the
   * submission, so a vendor can only acknowledge a packet on a candidate they
   * themselves submitted.
   */
  @Post("submissions/:id/acknowledge")
  async acknowledge(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.submissions.acknowledgeFeedback(
      tenant.vendor!.vendor.id,
      tenant.vendor!.organizationId,
      id,
    );
  }

  @Get("submissions")
  list(@Tenant() tenant: TenantContext) {
    return this.submissions.listForVendor(
      tenant.vendor!.vendor.id,
      tenant.vendor!.organizationId,
    );
  }
}

/** Org-side view: full detail, entitlement-scoped. */
@Controller("submissions")
@OrgScope()
export class OrgSubmissionsController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async list(@Tenant() tenant: TenantContext, @Query("position_id") positionId?: string) {
    const access = await this.authz.access(tenant);
    return this.submissions.listForOrg(
      tenant.org!.organizationId,
      access.unitIdsFor("submissions.view"),
      positionId,
    );
  }

}
