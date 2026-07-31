import { Body, Controller, Get, Patch } from "@nestjs/common";
import { z } from "zod";
import { parseBody } from "../common/zod";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

const SettingsPatch = z
  .object({
    ownership_scope: z.enum(["position", "organization"]).optional(),
    ownership_window_days: z.number().int().min(1).max(3650).optional(),
    feedback_visibility: z.enum(["open", "hidden_until_submitted"]).optional(),
    default_phone_region: z.string().length(2).optional(),
    branding: z
      .object({
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        product_label: z.string().max(60).optional(),
      })
      .optional(),
  })
  .strict();

@Controller("settings")
@OrgScope()
export class SettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async get(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: tenant.org!.organizationId },
      select: { name: true, slug: true, settings: true },
    });
    return org;
  }

  @Patch()
  async patch(@Tenant() tenant: TenantContext, @Body() body: unknown) {
    const access = await this.authz.access(tenant);
    this.authz.require(access, "org.settings");
    const input = parseBody(SettingsPatch, body);
    const orgId = tenant.org!.organizationId;
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { settings: true },
    });
    const current = (org.settings ?? {}) as Record<string, unknown>;
    const merged = {
      ...current,
      ...input,
      branding: { ...(current.branding as object | undefined), ...input.branding },
    };
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: { settings: merged },
      select: { name: true, slug: true, settings: true },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "org_user",
        actorId: tenant.org!.user.id,
        event: "org.settings_updated",
        entityType: "organization",
        entityId: orgId,
        payload: input,
      },
    });
    return updated;
  }
}
