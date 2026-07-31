import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

/** Basic user directory for panel pickers etc. (names + roles only). */
@Controller("org-users")
@OrgScope()
export class OrgUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const users = await this.prisma.orgUser.findMany({
      where: { organizationId: tenant.org!.organizationId, status: "active" },
      include: { memberships: { select: { role: true } } },
      orderBy: { name: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: [...new Set(u.memberships.map((m) => m.role))],
    }));
  }
}
