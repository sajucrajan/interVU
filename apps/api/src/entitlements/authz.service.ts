import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenancy/tenant-context";
import { Access, buildAccess } from "./access";
import { type Permission } from "./permissions";

@Injectable()
export class AuthzService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve the org user's effective access (one tree query per request). */
  async access(tenant: TenantContext): Promise<Access> {
    const org = tenant.org!;
    const units = await this.prisma.orgUnit.findMany({
      where: { organizationId: org.organizationId },
      select: { id: true, parentId: true },
    });
    return buildAccess(
      org.memberships.map((m) => ({
        orgUnitId: m.orgUnitId,
        // Already resolved from the role row when the context was built.
        permissions: m.permissions,
      })),
      units,
    );
  }

  /** 403 with the missing permission named (docs/09 §6.3). */
  require(access: Access, permission: Permission, unitId?: string): void {
    if (!access.can(permission, unitId)) {
      throw new ForbiddenException({
        code: "insufficient_scope",
        permission,
        ...(unitId ? { org_unit_id: unitId } : {}),
      });
    }
  }
}
