import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import { SCOPE_KEY, type RequiredScope } from "./scope.decorator";
import { TENANT_CONTEXT_KEY, type TenantContext } from "./tenant-context";

/**
 * DEV-ONLY identity resolution until real session auth lands (M0 auth issue).
 *
 * Org routes:    x-intervu-org: <org slug>, x-intervu-user: <org user email>
 * Vendor routes: x-intervu-vendor-user: <vendor user email>
 *
 * Hard-disabled outside development: production boots must use real auth.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<RequiredScope | undefined>(
      SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) return true; // unscoped route (e.g. /healthz)

    if (process.env.NODE_ENV === "production") {
      throw new UnauthorizedException(
        "Dev header auth is disabled in production",
      );
    }

    const req = context.switchToHttp().getRequest();
    const tenant: TenantContext = {};

    if (scope === "org") {
      const slug = req.headers["x-intervu-org"];
      const email = req.headers["x-intervu-user"];
      if (typeof slug !== "string" || typeof email !== "string") {
        throw new UnauthorizedException(
          "Missing x-intervu-org / x-intervu-user headers (dev auth)",
        );
      }
      const org = await this.prisma.organization.findUnique({
        where: { slug },
      });
      if (!org) throw new UnauthorizedException("Unknown organization");
      const user = await this.prisma.orgUser.findUnique({
        where: {
          organizationId_email: { organizationId: org.id, email },
        },
        include: { memberships: true },
      });
      if (!user || user.status === "disabled") {
        throw new UnauthorizedException("Unknown or disabled org user");
      }
      tenant.org = {
        organizationId: org.id,
        user,
        memberships: user.memberships.map((m) => ({
          role: m.role,
          orgUnitId: m.orgUnitId,
        })),
      };
    } else {
      const email = req.headers["x-intervu-vendor-user"];
      if (typeof email !== "string") {
        throw new UnauthorizedException(
          "Missing x-intervu-vendor-user header (dev auth)",
        );
      }
      const user = await this.prisma.vendorUser.findFirst({
        where: { email },
        include: { vendor: true },
      });
      if (!user || user.status === "disabled") {
        throw new UnauthorizedException("Unknown or disabled vendor user");
      }
      tenant.vendor = { vendor: user.vendor, user };
    }

    req[TENANT_CONTEXT_KEY] = tenant;
    return true;
  }
}
