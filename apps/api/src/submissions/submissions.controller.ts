import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DirectCandidateCreate, VendorSubmissionCreate } from "@intervu/contracts";
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

/**
 * A candidate added by the organization itself (docs/05 §8). Gated on
 * applications.transition in the position's unit: the same hand that moves
 * people through the pipeline is the one that can put them in it.
 */
@Controller("positions")
@OrgScope()
export class DirectCandidatesController {
  constructor(
    private readonly submissions: SubmissionsService,
    private readonly authz: AuthzService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(":id/candidates")
  async add(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(DirectCandidateCreate, body);
    const { organizationId, user } = tenant.org!;
    const position = await this.prisma.position.findFirst({
      where: { id, organizationId },
      select: { orgUnitId: true },
    });
    if (!position) throw new NotFoundException("Position not found");
    const access = await this.authz.access(tenant);
    this.authz.require(access, "applications.transition", position.orgUnitId);
    return this.submissions.addDirect(organizationId, id, user.id, input);
  }
}
