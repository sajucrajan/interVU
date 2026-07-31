import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { PanelCreate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { PanelsService } from "./panels.service";

@Controller()
@OrgScope()
export class PanelsController {
  constructor(
    private readonly panels: PanelsService,
    private readonly authz: AuthzService,
  ) {}

  @Post("panels")
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(PanelCreate, body);
    const access = await this.authz.access(tenant);
    // Org-wide panels need org-wide panels.manage; scoped panels need it on
    // the scope node (a team-level HM can't create org-wide panels).
    if (input.org_unit_id) {
      this.authz.require(access, "panels.manage", input.org_unit_id);
    } else if (access.unitIdsFor("panels.manage") !== "org") {
      this.authz.require(access, "panels.manage", "__org_wide__");
    }
    return this.panels.create(tenant.org!.organizationId, input);
  }

  @Get("panels")
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "interviews.schedule");
    return this.panels.list(tenant.org!.organizationId);
  }

  /** Skill taxonomy for pickers/autocomplete on the posting form. */
  @Get("skills")
  async skills(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "positions.view");
    return this.panels.listSkills(tenant.org!.organizationId);
  }

  @Get("applications/:id/panel-suggestions")
  async suggestions(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "interviews.schedule");
    return this.panels.suggestions(tenant.org!.organizationId, id);
  }
}
