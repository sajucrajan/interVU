import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { AttributeCreate, AttributesReorder, AttributeUpdate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { AttributesService } from "./attributes.service";

/**
 * Ways of working (docs/01 §4, Ways of working).
 *
 * Reading the set is open to every org user for the same reason the skill
 * vocabulary is: an interviewer rates against it and holds no hiring
 * permission. Changing it is organization policy, so it sits with
 * `org.settings` (docs/09 §2) — the same hand that sets the feedback policy.
 */
@Controller("attributes")
@OrgScope()
export class AttributesController {
  constructor(
    private readonly attributes: AttributesService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async list(@Tenant() tenant: TenantContext, @Query("all") all?: string) {
    const orgId = tenant.org!.organizationId;
    if (all === "true") {
      const access = await this.authz.access(tenant);
      this.authz.require(access, "org.settings");
      return this.attributes.all(orgId);
    }
    return this.attributes.active(orgId);
  }

  @Post()
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    const input = parseBody(AttributeCreate, body);
    return this.attributes.create(tenant.org!.organizationId, tenant.org!.user.id, input);
  }

  @Put("order")
  async reorder(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    const input = parseBody(AttributesReorder, body);
    return this.attributes.reorder(tenant.org!.organizationId, tenant.org!.user.id, input);
  }

  @Patch(":id")
  async update(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    const input = parseBody(AttributeUpdate, body);
    return this.attributes.update(tenant.org!.organizationId, tenant.org!.user.id, id, input);
  }
}
