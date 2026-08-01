import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { PositionCreate, ReleasePolicy } from "@intervu/contracts";
import { z } from "zod";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { PositionsService } from "./positions.service";

const ManualRelease = z.object({ vendor_org_id: z.string().uuid() });

@Controller("positions")
@OrgScope()
export class PositionsController {
  constructor(
    private readonly positions: PositionsService,
    private readonly authz: AuthzService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(PositionCreate, body);
    const { organizationId, user } = tenant.org!;
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.create", input.org_unit_id);
    return this.positions.create(organizationId, user.id, input);
  }

  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    return this.positions.list(
      tenant.org!.organizationId,
      access.unitIdsFor("positions.view"),
    );
  }

  @Get(":id")
  async detail(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const position = await this.positions.detail(tenant.org!.organizationId, id);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.view", position.orgUnitId);
    return position;
  }

  @Post(":id/publish")
  async publish(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const policy = parseBody(ReleasePolicy, body);
    const { organizationId, user } = tenant.org!;
    await this.requirePermissionOnPosition(tenant, id, "positions.publish");
    return this.positions.publish(organizationId, id, user.id, policy);
  }

  /** Clone into a new draft — "another one like this". */
  @Post(":id/duplicate")
  async duplicate(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const source = await this.prisma.position.findFirst({
      where: { id, organizationId: tenant.org!.organizationId },
      select: { orgUnitId: true },
    });
    if (!source) throw new NotFoundException("Position not found");
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.create", source.orgUnitId);
    return this.positions.duplicate(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
    );
  }

  @Post(":id/releases")
  async release(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(ManualRelease, body);
    const { organizationId, user } = tenant.org!;
    await this.requirePermissionOnPosition(tenant, id, "positions.release");
    return this.positions.releaseToVendor(
      organizationId,
      id,
      input.vendor_org_id,
      user.id,
    );
  }

  /** Scope checks target the position's unit (docs/09 §6.3). */
  private async requirePermissionOnPosition(
    tenant: TenantContext,
    positionId: string,
    permission: "positions.publish" | "positions.release",
  ) {
    const position = await this.prisma.position.findFirst({
      where: { id: positionId, organizationId: tenant.org!.organizationId },
      select: { orgUnitId: true },
    });
    if (!position) throw new NotFoundException("Position not found");
    const access = await this.authz.access(tenant);
    this.authz.require(access, permission, position.orgUnitId);
  }
}
