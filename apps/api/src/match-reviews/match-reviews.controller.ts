import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { MatchReviewResolve } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { MatchReviewsService } from "./match-reviews.service";

@Controller("match-reviews")
@OrgScope()
export class MatchReviewsController {
  constructor(
    private readonly reviews: MatchReviewsService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "candidates.merge");
    return this.reviews.list(tenant.org!.organizationId);
  }

  @Post(":id/resolve")
  async resolve(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(MatchReviewResolve, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "candidates.merge");
    return this.reviews.resolve(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
      input.action,
    );
  }
}
