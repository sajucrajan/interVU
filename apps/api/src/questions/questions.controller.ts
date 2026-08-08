import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { QuestionCreate, QuestionUpdate, QuestionVote } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { QuestionsService } from "./questions.service";

/**
 * The shared question bank.
 *
 * Deliberately NOT permission-gated beyond being an org user. Interviewers are
 * the people who know what a good question is, and they hold no hiring
 * permissions at all — gating authorship on `interviews.schedule` or similar
 * would lock out exactly the contributors the bank depends on.
 */
@Controller("questions")
@OrgScope()
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  /**
   * The competency taxonomy, for the bank's tag picker.
   *
   * Deliberately not behind `positions.view`: interviewers do not hold that
   * permission (docs/09 §2), so reusing the existing /skills route would 403
   * exactly the people the bank depends on. A skill list is a vocabulary, not
   * candidate data — the same reasoning that makes org structure visible to
   * every org user.
   */
  @Get("skills")
  skills(@Tenant() tenant: TenantContext) {
    return this.questions.skills(tenant.org!.organizationId);
  }

  @Get()
  list(
    @Tenant() tenant: TenantContext,
    @Query("skill_id") skillId?: string,
    @Query("q") q?: string,
  ) {
    return this.questions.list(tenant.org!.organizationId, tenant.org!.user.id, {
      skillId,
      q,
    });
  }

  @Post()
  create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(QuestionCreate, body);
    return this.questions.create(
      tenant.org!.organizationId,
      tenant.org!.user.id,
      input,
    );
  }

  /**
   * Thumbs up / down. Any org user may vote — the people who ask the questions
   * are the ones who know which ones are worth asking.
   */
  @Put(":id/vote")
  vote(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(QuestionVote, body);
    return this.questions.vote(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
      input.value,
    );
  }

  @Patch(":id")
  update(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(QuestionUpdate, body);
    return this.questions.update(tenant.org!.organizationId, id, input);
  }
}
