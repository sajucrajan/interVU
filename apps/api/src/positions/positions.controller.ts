import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { PositionCreate, ReleasePolicy } from "@intervu/contracts";
import { z } from "zod";
import { parseBody } from "../common/zod";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { PositionsService } from "./positions.service";

const ManualRelease = z.object({ vendor_org_id: z.string().uuid() });

@Controller("positions")
@OrgScope()
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Post()
  create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(PositionCreate, body);
    const { organizationId, user } = tenant.org!;
    return this.positions.create(organizationId, user.id, input);
  }

  @Get()
  list(@Tenant() tenant: TenantContext) {
    return this.positions.list(tenant.org!.organizationId);
  }

  @Post(":id/publish")
  publish(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const policy = parseBody(ReleasePolicy, body);
    const { organizationId, user } = tenant.org!;
    return this.positions.publish(organizationId, id, user.id, policy);
  }

  @Post(":id/releases")
  release(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(ManualRelease, body);
    const { organizationId, user } = tenant.org!;
    return this.positions.releaseToVendor(
      organizationId,
      id,
      input.vendor_org_id,
      user.id,
    );
  }
}
