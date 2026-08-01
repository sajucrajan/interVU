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
import { RoleCreate, RoleUpdate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { PERMISSION_GROUPS } from "../entitlements/permissions";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { RolesService } from "./roles.service";

@Controller("roles")
@OrgScope()
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly authz: AuthzService,
  ) {}

  /**
   * The role list, readable by anyone who can grant access — the People screen
   * needs it to render the role picker.
   */
  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.roles.list(tenant.org!.organizationId);
  }

  /** The permission catalog, grouped for the role editor. */
  @Get("permissions")
  async permissions(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return PERMISSION_GROUPS;
  }

  @Post()
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(RoleCreate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.roles.create(tenant.org!.organizationId, input);
  }

  @Patch(":id")
  async update(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(RoleUpdate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.roles.update(tenant.org!.organizationId, id, input);
  }

  @Delete(":id")
  async remove(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.roles.remove(tenant.org!.organizationId, id);
  }
}
