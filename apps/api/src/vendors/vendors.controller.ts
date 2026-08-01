import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { VendorCreate, VendorUpdate, VendorUserCreate } from "@intervu/contracts";
import { z } from "zod";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { VendorsService } from "./vendors.service";

const UserStatusChange = z.object({ status: z.enum(["active", "disabled"]) });

/** The org's vendor relationships — used by release pickers and reporting. */
@Controller("vendors")
@OrgScope()
export class VendorsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vendors: VendorsService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    // Anyone who can release a position needs to see who they can release to.
    this.authz.require(access, "positions.view");
    return this.prisma.vendorOrg.findMany({
      where: { organizationId: tenant.org!.organizationId },
      select: {
        id: true,
        tier: true,
        status: true,
        contractStart: true,
        contractEnd: true,
        vendor: { select: { id: true, name: true } },
      },
      orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
    });
  }

  /** Admin view: contracts with their people and submission volume. */
  @Get("manage")
  async manage(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "vendors.manage");
    return this.vendors.list(tenant.org!.organizationId);
  }

  @Post()
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(VendorCreate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "vendors.manage");
    return this.vendors.create(tenant.org!.organizationId, input);
  }

  @Patch(":id")
  async update(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(VendorUpdate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "vendors.manage");
    return this.vendors.update(tenant.org!.organizationId, id, input);
  }

  @Post(":id/users")
  async inviteUser(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(VendorUserCreate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "vendors.manage");
    return this.vendors.inviteUser(tenant.org!.organizationId, id, input);
  }

  @Patch(":id/users/:userId")
  async setUserStatus(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(UserStatusChange, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "vendors.manage");
    return this.vendors.setUserStatus(
      tenant.org!.organizationId,
      id,
      userId,
      input.status,
    );
  }

  @Post(":id/users/:userId/invite")
  async reinviteUser(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "vendors.manage");
    return this.vendors.reinviteUser(tenant.org!.organizationId, id, userId);
  }
}
