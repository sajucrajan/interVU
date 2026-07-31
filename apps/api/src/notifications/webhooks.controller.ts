import { randomBytes } from "node:crypto";
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

const WebhookCreate = z.object({
  url: z.string().url().max(500),
  /** Empty = all events. */
  events: z.array(z.string().min(1).max(80)).max(30).default([]),
});

@Controller("webhooks")
@OrgScope()
export class WebhooksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Post()
  async create(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const input = parseBody(WebhookCreate, body);
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    const secret = randomBytes(24).toString("base64url");
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        organizationId: tenant.org!.organizationId,
        url: input.url,
        events: input.events,
        secret,
        createdById: tenant.org!.user.id,
      },
    });
    // The secret is returned ONCE at creation; store it on your side to
    // verify X-InterVU-Signature (sha256 HMAC of the raw body).
    return { id: endpoint.id, url: endpoint.url, events: endpoint.events, secret };
  }

  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId: tenant.org!.organizationId },
      select: { id: true, url: true, events: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  @Delete(":id")
  async remove(@Tenant() tenant: TenantContext, @Param("id", ParseUUIDPipe) id: string) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    await this.prisma.webhookEndpoint.deleteMany({
      where: { id, organizationId: tenant.org!.organizationId },
    });
    return { ok: true };
  }
}
