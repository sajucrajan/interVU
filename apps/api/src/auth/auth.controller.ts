import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { parseBody } from "../common/zod";
import { readCookie } from "../common/cookies";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService, SESSION_COOKIE } from "./auth.service";

const OrgLogin = z.object({
  org_slug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});
const VendorLogin = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
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
    const session = await this.auth.loginVendor(input.email, input.password);
    this.setCookie(res, session);
    return { ok: true, expires_at: session.expiresAt.toISOString() };
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
      return {
        kind: "org",
        email: ctx.org.user.email,
        name: ctx.org.user.name,
        organization_id: ctx.org.organizationId,
        organization: { name: org.name, branding },
        memberships: ctx.org.memberships.map((m) => ({
          role: m.role,
          org_unit_id: m.orgUnitId,
        })),
      };
    }
    return {
      kind: "vendor",
      email: ctx.vendor!.user.email,
      name: ctx.vendor!.user.name,
      vendor: ctx.vendor!.vendor.name,
      role: ctx.vendor!.user.role,
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
