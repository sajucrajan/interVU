import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { PositionCreate, PositionUpdate, ReleasePolicy } from "@intervu/contracts";
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

  /**
   * One URL for the role, whoever is asking.
   *
   * Holding `positions.view` on the unit gets the full record. Someone
   * without it who is sitting on a panel for this role gets a brief — the
   * work, not the commercials — because an interviewer was previously sent a
   * candidate and then refused the job description they were assessing
   * against. Everyone else still gets 403, unchanged.
   *
   * Degrading beats a second endpoint: every link in the product can point
   * here and be right for the reader who follows it, and no caller has to
   * know in advance which of the two it is entitled to.
   */
  @Get(":id")
  async detail(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const { organizationId, user } = tenant.org!;
    const position = await this.positions.detail(organizationId, id);
    const access = await this.authz.access(tenant);
    if (access.can("positions.view", position.orgUnitId)) {
      return { ...position, audience: "full", withheld: [] as string[] };
    }
    const brief = await this.positions.briefForOrgUser(organizationId, id, user.id);
    // No permission and no seat on the panel: the same 403 as before, raised
    // by the same code path, so scope stays invisible rather than probeable.
    if (!brief) this.authz.require(access, "positions.view", position.orgUnitId);
    return brief;
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

  /** Edit JD fields and/or pause / close / reopen. */
  @Patch(":id")
  async update(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(PositionUpdate, body);
    await this.requirePermissionOnPosition(tenant, id, "positions.publish");
    return this.positions.update(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
      input,
    );
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
