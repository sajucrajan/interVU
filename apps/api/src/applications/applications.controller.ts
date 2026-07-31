import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  DecisionCreate,
  InterviewCreate,
  StageTransitionCreate,
} from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { InterviewsService } from "../interviews/interviews.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { ApplicationsService } from "./applications.service";

@Controller("applications")
@OrgScope()
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly interviews: InterviewsService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async list(@Tenant() tenant: TenantContext, @Query("position_id") positionId?: string) {
    const access = await this.authz.access(tenant);
    return this.applications.list(
      tenant.org!.organizationId,
      access.unitIdsFor("submissions.view"),
      positionId,
    );
  }

  @Post(":id/transition")
  async transition(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(StageTransitionCreate, body);
    const access = await this.authz.access(tenant);
    return this.applications.transition(
      tenant.org!.organizationId,
      id,
      access,
      tenant.org!.user.id,
      input,
    );
  }

  @Post(":id/decision")
  async decide(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(DecisionCreate, body);
    const access = await this.authz.access(tenant);
    return this.applications.decide(
      tenant.org!.organizationId,
      id,
      access,
      tenant.org!.user.id,
      input,
    );
  }

  @Post(":id/interviews")
  async schedule(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(InterviewCreate, body);
    const access = await this.authz.access(tenant);
    return this.interviews.schedule(
      tenant.org!.organizationId,
      id,
      access,
      tenant.org!.user.id,
      input,
    );
  }

  @Get(":id/scorecards")
  async scorecards(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.interviews.scorecardsForApplication(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
    );
  }
}
