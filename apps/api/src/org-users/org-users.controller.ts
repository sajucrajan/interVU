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
import { MembershipGrant, OrgUserCreate, OrgUserUpdate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { OrgUsersService } from "./org-users.service";

@Controller("org-users")
@OrgScope()
export class OrgUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: OrgUsersService,
    private readonly authz: AuthzService,
  ) {}

  /** Basic user directory for panel pickers etc. (names + roles only). */
  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const users = await this.prisma.orgUser.findMany({
      where: { organizationId: tenant.org!.organizationId, status: "active" },
      include: { memberships: { select: { role: true } } },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: [...new Set(u.memberships.map((m) => m.role))],
    }));
  }

  /** Admin view: every user regardless of status, with each grant's scope. */
  @Get("manage")
  async manage(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.users.list(tenant.org!.organizationId);
  }

  @Post()
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(OrgUserCreate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.users.create(tenant.org!.organizationId, access, input);
  }

  @Patch(":id")
  async update(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(OrgUserUpdate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.users.update(tenant.org!.organizationId, id, input);
  }

  @Post(":id/memberships")
  async addMembership(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const grant = parseBody(MembershipGrant, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.users.addMembership(tenant.org!.organizationId, id, access, grant);
  }

  @Delete(":id/memberships/:membershipId")
  async removeMembership(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
  ) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.users.removeMembership(
      tenant.org!.organizationId,
      id,
      membershipId,
      access,
    );
  }

  /** Re-send (and rotate) the activation link. */
  @Post(":id/invite")
  async reinvite(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.manage_users");
    return this.users.reinvite(tenant.org!.organizationId, id);
  }
}
