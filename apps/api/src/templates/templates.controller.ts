import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { PositionTemplateCreate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { TemplatesService } from "./templates.service";

/**
 * Reusable job descriptions. Anyone who may create positions may manage the
 * templates those positions start from.
 */
@Controller("position-templates")
@OrgScope()
export class TemplatesController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.view");
    return this.templates.list(tenant.org!.organizationId);
  }

  @Get(":id")
  async detail(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.view");
    return this.templates.detail(tenant.org!.organizationId, id);
  }

  @Post()
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(PositionTemplateCreate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.create");
    return this.templates.create(
      tenant.org!.organizationId,
      tenant.org!.user.id,
      input,
    );
  }

  @Delete(":id")
  async remove(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.create");
    return this.templates.remove(tenant.org!.organizationId, id);
  }
}
