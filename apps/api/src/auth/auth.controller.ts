import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { ActivateAccount } from "@intervu/contracts";
import { parseBody } from "../common/zod";
import { readCookie } from "../common/cookies";
import { AuthzService } from "../entitlements/authz.service";
import { ALL_PERMISSIONS } from "../entitlements/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService, SESSION_COOKIE } from "./auth.service";

const OrgLogin = z.object({
  org_slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});
const VendorLogin = z.object({
  // Vendors sign in per organization — see AuthService.loginVendor.
  org_slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Post("org/login")
  async orgLogin(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(OrgLogin, body);
    const session = await this.auth.loginOrg(input.org_slug, input.email, input.password);
    this.setCookie(res, session);
    return { ok: true, expires_at: session.expiresAt.toISOString() };
  }

  @Post("vendor/login")
  async vendorLogin(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(VendorLogin, body);
    const session = await this.auth.loginVendor(
      input.org_slug,
      input.email,
      input.password,
    );
    this.setCookie(res, session);
    return { ok: true, expires_at: session.expiresAt.toISOString() };
  }

  /**
   * Look up an invitation without redeeming it, so the activation page can
   * greet the user and show which organization they're joining. Unauthenticated
   * by necessity — the token IS the credential.
   */
  @Get("invite/:token")
  async invite(@Param("token") token: string) {
    return this.auth.describeInvite(token);
  }

  /** Redeem an invitation: set the password and activate the account. */
  @Post("activate")
  async activate(@Body() body: unknown) {
    const input = parseBody(ActivateAccount, body);
    return this.auth.activate(input.token, input.password);
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await this.auth.logout(token);
    res.clearCookie(SESSION_COOKIE);
    return { ok: true };
  }

  @Get("me")
  async me(@Req() req: Request) {
    const token = readCookie(req, SESSION_COOKIE);
    const ctx = token ? await this.auth.resolveSession(token) : null;
    if (!ctx) throw new UnauthorizedException({ code: "not_authenticated" });
    if (ctx.org) {
      // White-label: the product is InterVU, but the workspace wears the
      // organization's name and optional branding (accent color, label).
      const org = await this.prisma.organization.findUniqueOrThrow({
        where: { id: ctx.org.organizationId },
        select: { name: true, settings: true },
      });
      const branding =
        ((org.settings as { branding?: Record<string, string> })?.branding) ?? {};
      // Capabilities let the UI hide what this user cannot act on, instead of
      // showing pages that render empty or 403 on click (docs/09).
      const access = await this.authz.access(ctx);
      const capabilities = ALL_PERMISSIONS.filter((perm) => access.can(perm));
      return {
        kind: "org",
        email: ctx.org.user.email,
        name: ctx.org.user.name,
        organization_id: ctx.org.organizationId,
        organization: { name: org.name, branding },
        capabilities,
        memberships: ctx.org.memberships.map((m) => ({
          role_id: m.roleId,
          role: m.roleKey,
          role_name: m.roleName,
          org_unit_id: m.orgUnitId,
        })),
      };
    }
    const vendorOrg = await this.prisma.organization.findUnique({
      where: { id: ctx.vendor!.organizationId },
      select: { name: true, slug: true, settings: true },
    });
    return {
      kind: "vendor",
      email: ctx.vendor!.user.email,
      name: ctx.vendor!.user.name,
      vendor: ctx.vendor!.vendor.name,
      role: ctx.vendor!.user.role,
      // Which client organization this session is scoped to.
      organization: vendorOrg
        ? {
            name: vendorOrg.name,
            slug: vendorOrg.slug,
            branding:
              ((vendorOrg.settings as { branding?: Record<string, string> })?.branding) ?? {},
          }
        : null,
    };
  }

  private setCookie(res: Response, session: { token: string; expiresAt: Date }) {
    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/",
    });
  }
}
