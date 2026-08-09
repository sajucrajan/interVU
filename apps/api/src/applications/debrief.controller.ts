import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { DebriefUpdate, FeedbackPacketUpsert } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";
import { ApplicationsService } from "./applications.service";
import { DebriefService } from "./debrief.service";

@Controller("applications")
@OrgScope()
export class DebriefController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
    private readonly applications: ApplicationsService,
    private readonly debriefs: DebriefService,
  ) {}

  /**
   * Reading a debrief needs `submissions.view`, not `decisions.record`.
   *
   * Recruiters run the process — chasing outstanding scorecards and drafting
   * the vendor-facing packet is their job — but they deliberately do not hold
   * `decisions.record` (docs/09 §2), so gating the READ on it locked the main
   * workflow role out of the screen entirely. Recording the decision and
   * editing the internal reason stay restricted below; only looking is
   * widened.
   */
  @Get(":id/debrief")
  async get(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    await this.applications.requireOnUnit(
      tenant.org!.organizationId, id, access, "submissions.view",
    );
    return this.debriefs.debrief(tenant.org!.organizationId, id);
  }

  /** Internal reason — never leaves the organization. */
  @Patch(":id/debrief")
  async update(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(DebriefUpdate, body);
    const access = await this.authz.access(tenant);
    await this.applications.requireOnUnit(
      tenant.org!.organizationId, id, access, "decisions.record",
    );
    const debrief = await this.debriefs.ensure(tenant.org!.organizationId, id);
    return this.prisma.debrief.update({
      where: { id: debrief.id },
      data: { internalReason: input.internal_reason ?? debrief.internalReason },
      select: { id: true, internalReason: true },
    });
  }

  /** Compose the packet. Saving is not releasing. */
  @Post(":id/debrief/packet")
  async packet(
    @Tenant() tenant: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseBody(FeedbackPacketUpsert, body);
    const access = await this.authz.access(tenant);
    await this.applications.requireOnUnit(
      tenant.org!.organizationId, id, access, "decisions.record",
    );
    const debrief = await this.debriefs.ensure(tenant.org!.organizationId, id);
    const data = {
      visibility: input.visibility,
      headline: input.headline,
      summary: input.summary,
      strengths: input.strengths,
      gaps: input.gaps,
      reconsiderFor: input.reconsider_for ?? null,
      resubmitAfter: input.resubmit_after ?? null,
      isDraft: input.is_draft,
    };
    return this.prisma.feedbackPacket.upsert({
      where: { debriefId: debrief.id },
      update: data,
      create: { ...data, debriefId: debrief.id },
    });
  }

  /** A separate, audited event from deciding. */
  @Post(":id/debrief/release")
  async release(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    await this.applications.requireOnUnit(
      tenant.org!.organizationId, id, access, "decisions.record",
    );
    return this.debriefs.release(
      tenant.org!.organizationId, id, tenant.org!.user.id,
    );
  }
}
