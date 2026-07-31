import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import { readCookie } from "../common/cookies";
import { PrismaService } from "../prisma/prisma.service";
import { SCOPE_KEY, type RequiredScope } from "./scope.decorator";
import { TENANT_CONTEXT_KEY, type TenantContext } from "./tenant-context";

/**
 * Resolves the request identity for @OrgScope()/@VendorScope() routes:
 * 1. Session cookie (real auth — docs/06 §5).
 * 2. Dev headers, NON-PRODUCTION ONLY (x-intervu-org + x-intervu-user, or
 *    x-intervu-vendor-user) — kept for scripts, curl, and CI fixtures.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<RequiredScope | undefined>(
      SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) return true; // unscoped route (healthz, auth)

    const req = context.switchToHttp().getRequest();

    const token = readCookie(req, SESSION_COOKIE);
    const fromSession = token ? await this.auth.resolveSession(token) : null;
    const tenant = fromSession ?? (await this.devHeaderContext(req));

    if (!tenant || (scope === "org" ? !tenant.org : !tenant.vendor)) {
      throw new UnauthorizedException({
        code: "not_authenticated",
        detail: `This route requires an authenticated ${scope} session`,
      });
    }

    req[TENANT_CONTEXT_KEY] = tenant;
    return true;
  }

  private async devHeaderContext(req: {
    headers: Record<string, unknown>;
  }): Promise<TenantContext | null> {
    if (process.env.NODE_ENV === "production") return null;

    const orgSlug = req.headers["x-intervu-org"];
    const orgEmail = req.headers["x-intervu-user"];
    if (typeof orgSlug === "string" && typeof orgEmail === "string") {
      const org = await this.prisma.organization.findUnique({
        where: { slug: orgSlug },
      });
      if (!org) return null;
      const user = await this.prisma.orgUser.findUnique({
        where: { organizationId_email: { organizationId: org.id, email: orgEmail } },
        include: { memberships: true },
      });
      if (!user || user.status === "disabled") return null;
      return {
        org: {
          organizationId: org.id,
          user,
          memberships: user.memberships.map((m) => ({
            role: m.role,
            orgUnitId: m.orgUnitId,
          })),
        },
      };
    }

    // Vendor dev auth is org-scoped like the real login: pair
    // x-intervu-vendor-user with x-intervu-org (defaults to the vendor's only
    // org when unambiguous, so existing scripts keep working).
    const vendorEmail = req.headers["x-intervu-vendor-user"];
    if (typeof vendorEmail === "string") {
      const user = await this.prisma.vendorUser.findFirst({
        where: { email: vendorEmail },
        include: { vendor: { include: { vendorOrgs: true } } },
      });
      if (!user || user.status === "disabled") return null;

      const headerSlug = req.headers["x-intervu-org"];
      let organizationId: string | undefined;
      if (typeof headerSlug === "string") {
        const org = await this.prisma.organization.findUnique({
          where: { slug: headerSlug },
        });
        if (!org || !user.vendor.vendorOrgs.some((vo) => vo.organizationId === org.id)) {
          return null;
        }
        organizationId = org.id;
      } else if (user.vendor.vendorOrgs.length === 1) {
        organizationId = user.vendor.vendorOrgs[0]!.organizationId;
      } else {
        return null; // ambiguous — the caller must name the organization
      }

      return {
        vendor: { vendor: user.vendor, user, organizationId },
      };
    }

    return null;
  }
}
