import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RoleCreate, RoleUpdate } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { sanitizePermissions } from "../entitlements/permissions";

/** Slug from a display name: "Release Train Engineer" → release_train_engineer */
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const roles = await this.prisma.role.findMany({
      where: { organizationId },
      include: { _count: { select: { memberships: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      is_system: r.isSystem,
      grants: r._count.memberships,
    }));
  }

  async create(organizationId: string, input: RoleCreate) {
    const name = input.name.trim();
    const key = slugify(name);
    if (!key) {
      throw new BadRequestException({
        code: "invalid_name",
        detail: "Give the role a name with at least one letter or number.",
      });
    }
    const clash = await this.prisma.role.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
    if (clash) {
      throw new ConflictException({
        code: "role_exists",
        detail: `A role called “${clash.name}” already exists.`,
      });
    }
    return this.prisma.role.create({
      data: {
        organizationId,
        key,
        name,
        description: input.description?.trim() || null,
        permissions: sanitizePermissions(input.permissions),
        isSystem: false,
      },
      select: { id: true, key: true, name: true, permissions: true },
    });
  }

  async update(organizationId: string, id: string, input: RoleUpdate) {
    const role = await this.prisma.role.findFirst({ where: { id, organizationId } });
    if (!role) throw new NotFoundException("Role not found");

    const permissions =
      input.permissions !== undefined
        ? sanitizePermissions(input.permissions)
        : role.permissions;

    // Removing org.manage_users from a role can lock the organization out of
    // its own administration — the same failure the last-admin guard prevents,
    // reached from the other direction.
    if (!permissions.includes("org.manage_users")) {
      await this.assertOthersCanStillAdminister(organizationId, id);
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        // System roles keep their name and key: they are referenced by the
        // seed, the docs and the demo accounts. Their permissions are free.
        ...(input.name !== undefined && !role.isSystem
          ? { name: input.name.trim() }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.permissions !== undefined ? { permissions } : {}),
      },
      select: { id: true, key: true, name: true, permissions: true },
    });
  }

  async remove(organizationId: string, id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!role) throw new NotFoundException("Role not found");
    if (role.isSystem) {
      throw new BadRequestException({
        code: "system_role",
        detail: "Built-in roles cannot be deleted. Change its permissions instead.",
      });
    }
    if (role._count.memberships > 0) {
      // Grants, not people: one person may hold the same role at several
      // scopes, which is exactly how a program spanning teams is expressed.
      const n = role._count.memberships;
      throw new BadRequestException({
        code: "role_in_use",
        detail: `This role is still granted ${n} time${n === 1 ? "" : "s"}. Revoke it first.`,
      });
    }
    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Would anyone still be able to administer people if this role stopped
   * granting it? Counts active users holding some OTHER role that carries
   * org.manage_users org-wide.
   */
  private async assertOthersCanStillAdminister(
    organizationId: string,
    excludingRoleId: string,
  ): Promise<void> {
    const remaining = await this.prisma.orgMembership.count({
      where: {
        orgUnitId: null,
        roleId: { not: excludingRoleId },
        orgUser: { organizationId, status: "active" },
        role: { permissions: { has: "org.manage_users" } },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException({
        code: "last_admin_role",
        detail:
          "This is the only role granting organization-wide user management. " +
          "Give another role that permission first.",
      });
    }
  }
}
