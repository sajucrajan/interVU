import { Body, Controller, Get, Post } from "@nestjs/common";
import { OrgUnitCreate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { OrgUnitsService } from "./org-units.service";

@Controller("org-units")
@OrgScope()
export class OrgUnitsController {
  constructor(
    private readonly orgUnits: OrgUnitsService,
    private readonly authz: AuthzService,
  ) {}

  @Post()
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(OrgUnitCreate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_structure");
    return this.orgUnits.create(tenant.org!.organizationId, input);
  }

  @Get()
  tree(@Tenant() tenant: TenantContext) {
    return this.orgUnits.tree(tenant.org!.organizationId);
  }
}
