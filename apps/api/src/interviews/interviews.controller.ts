import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ScorecardCreate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { InterviewsService } from "./interviews.service";

@Controller("interviews")
@OrgScope()
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

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
