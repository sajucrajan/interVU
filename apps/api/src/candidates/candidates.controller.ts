import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { FlagCreate } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { CandidatesService } from "./candidates.service";
import { ErasureService } from "./erasure.service";

@Controller("candidates")
@OrgScope()
export class CandidatesController {
  constructor(
    private readonly candidates: CandidatesService,
    private readonly authz: AuthzService,
    private readonly erasure: ErasureService,
  ) {}

  /**
   * GDPR erasure. Two-step by design: the caller must pass
   * {confirm: "<candidate id>"} so a stray click can't destroy PII.
   */
  @Delete(":id")
  async erase(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(z.object({ confirm: z.string() }), body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings"); // admin-only
    if (input.confirm !== id) {
      return { ok: false, code: "confirmation_mismatch" };
    }
    return this.erasure.erase(tenant.org!.organizationId, id, tenant.org!.user.id);
  }

  @Get(":id/timeline")
  async timeline(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    return this.candidates.timeline(
      tenant.org!.organizationId,
      id,
      access,
      tenant.org!.user.id,
    );
  }

  @Post(":id/merge")
  async merge(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(
      z.object({ merge_candidate_id: z.string().uuid() }),
      body,
    );
    const access = await this.authz.access(tenant);
    this.authz.require(access, "candidates.merge");
    return this.candidates.merge(
      tenant.org!.organizationId,
      id,
      input.merge_candidate_id,
      tenant.org!.user.id,
    );
  }

  @Post("merge-events/:id/reverse")
  async reverseMerge(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "candidates.merge");
    return this.candidates.reverseMerge(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
    );
  }

  @Post(":id/flags")
  async addFlag(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(FlagCreate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "candidates.flag");
    return this.candidates.addFlag(
      tenant.org!.organizationId,
      id,
      tenant.org!.user.id,
      input,
    );
  }
}
