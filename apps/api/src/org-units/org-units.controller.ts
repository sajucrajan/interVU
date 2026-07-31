import { Body, Controller, Get, Post } from "@nestjs/common";
import { OrgUnitCreate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { OrgUnitsService } from "./org-units.service";

@Controller("org-units")
@OrgScope()
export class OrgUnitsController {
  constructor(private readonly orgUnits: OrgUnitsService) {}

  @Post()
  create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(OrgUnitCreate, body);
    return this.orgUnits.create(tenant.org!.organizationId, input);
  }

  @Get()
  tree(@Tenant() tenant: TenantContext) {
    return this.orgUnits.tree(tenant.org!.organizationId);
  }
}
