import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ScorecardCreate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { InterviewsService } from "./interviews.service";
import { RoomService } from "./room.service";

@Controller("interviews")
@OrgScope()
export class InterviewsController {
  constructor(
    private readonly interviews: InterviewsService,
    private readonly room: RoomService,
  ) {}

  /**
   * The interview room: everything the panel needs on screen DURING the call.
   * Panel membership is the grant, so no unit scope is consulted.
   */
  @Get(":id/room")
  packet(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.room.packet(tenant.org!.organizationId, id, tenant.org!.user.id);
  }

  /** Notes taken live, autosaved. Private to their author. */
  @Get(":id/draft")
  getDraft(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.room.draft(id, tenant.org!.user.id);
  }

  @Put(":id/draft")
  saveDraft(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.room.saveDraft(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
      body,
    );
  }

  /** The interviewer home screen — assignment-scoped, no tree grants needed. */
  @Get("mine")
  mine(@Tenant() tenant: TenantContext) {
    return this.interviews.mine(tenant.org!.organizationId, tenant.org!.user.id);
  }

  @Post(":id/scorecards")
  submitScorecard(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(ScorecardCreate, body);
    return this.interviews.submitScorecard(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
      input,
    );
  }
}
