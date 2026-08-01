import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { OrgUnitCreate, OrgUnitUpdate } from "@intervu/contracts";
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

  /** Admin view: the tree annotated with what each node holds. */
  @Get("manage")
  async manage(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_structure");
    return this.orgUnits.manageTree(tenant.org!.organizationId);
  }

  @Patch(":id")
  async update(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(OrgUnitUpdate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_structure");
    return this.orgUnits.update(tenant.org!.organizationId, id, input);
  }

  @Delete(":id")
  async remove(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_structure");
    return this.orgUnits.remove(tenant.org!.organizationId, id);
  }
}
