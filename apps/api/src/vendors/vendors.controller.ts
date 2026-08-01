import { Controller, Get } from "@nestjs/common";
import { AuthzService } from "../entitlements/authz.service";
import { PrismaService } from "../prisma/prisma.service";
import { OrgScope, Tenant } from "../tenancy/scope.decorator";
import type { TenantContext } from "../tenancy/tenant-context";

/** The org's vendor relationships — used by release pickers and reporting. */
@Controller("vendors")
@OrgScope()
export class VendorsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthzService,
  ) {}

  @Get()
  async list(@Tenant() tenant: TenantContext) {
    const access = await this.authz.access(tenant);
    // Anyone who can release a position needs to see who they can release to.
    this.authz.require(access, "positions.view");
    return this.prisma.vendorOrg.findMany({
      where: { organizationId: tenant.org!.organizationId },
      select: {
        id: true,
        tier: true,
        status: true,
        contractStart: true,
        contractEnd: true,
        vendor: { select: { id: true, name: true } },
      },
      orderBy: [{ tier: "asc" }, { createdAt: "asc" }],
    });
  }
}
