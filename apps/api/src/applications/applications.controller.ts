import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  DecisionCreate,
  InterviewCreate,
  StageTransitionCreate,
} from "@intervu/contracts";
import { DropoutRecord, OfferOutcome, OfferRecord } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { InterviewsService } from "../interviews/interviews.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { ApplicationsService } from "./applications.service";
import { ScreeningService } from "./screening.service";
import { OffersService } from "./offers.service";

@Controller("applications")
@OrgScope()
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly screening_: ScreeningService,
    private readonly interviews: InterviewsService,
    private readonly authz: AuthzService,
    private readonly offers: OffersService,
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

  /**
   * The screening packet. Needs only `submissions.view`: screening IS the
   * recruiter's job, and the queue has been pointing at it since M2.
   */
  @Get(":id/screening")
  async screening(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    await this.applications.requireOnUnit(
      tenant.org!.organizationId, id, access, "submissions.view",
    );
    return this.screening_.screen(tenant.org!.organizationId, id);
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

  /** Extend or amend the offer on an application. */
  @Post(":id/offer")
  async offer(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(OfferRecord, body);
    const access = await this.authz.access(tenant);
    await this.applications.requireOnUnit(
      tenant.org!.organizationId, id, access, "decisions.record",
    );
    return this.offers.record(tenant.org!.organizationId, id, tenant.org!.user.id, input);
  }

  /** Accept or decline it — the event that makes time-to-hire measurable. */
  @Post(":id/offer/close")
  async closeOffer(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(OfferOutcome, body);
    const access = await this.authz.access(tenant);
    await this.applications.requireOnUnit(
      tenant.org!.organizationId, id, access, "decisions.record",
    );
    return this.offers.close(tenant.org!.organizationId, id, input);
  }

  /** The candidate left the process, which is not the same as a rejection. */
  @Post(":id/dropout")
  async dropout(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(DropoutRecord, body);
    const access = await this.authz.access(tenant);
    await this.applications.requireOnUnit(
      tenant.org!.organizationId, id, access, "applications.transition",
    );
    return this.offers.dropout(tenant.org!.organizationId, id, input);
  }
}
