import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrgRole } from "@prisma/client";
import type { MembershipGrant, OrgUserCreate, OrgUserUpdate } from "@intervu/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { InvitesService, type Invite } from "../invites/invites.service";
import type { Access } from "../entitlements/access";

@Injectable()
export class OrgUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InvitesService,
  ) {}

  /**
   * Admin directory: every user regardless of status, with their grants
   * resolved to unit names. The plain `GET /org-users` list stays a
   * lightweight active-only directory for panel pickers.
   */
  async list(organizationId: string) {
    const users = await this.prisma.orgUser.findMany({
      where: { organizationId },
      include: {
        memberships: { include: { orgUnit: { select: { id: true, name: true } } } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      /** No password set yet — the invite has not been redeemed. */
      pending_activation: u.passwordHash === null,
      createdAt: u.createdAt,
      memberships: u.memberships.map((m) => ({
        id: m.id,
        role: m.role,
        org_unit_id: m.orgUnitId,
        org_unit_name: m.orgUnit?.name ?? null,
      })),
    }));
  }

  async create(organizationId: string, access: Access, input: OrgUserCreate) {
    for (const g of input.memberships) this.assertCanGrant(access, g);

    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.orgUser.findFirst({
      where: { organizationId, email },
    });
    if (existing) {
      throw new ConflictException({
        code: "user_exists",
        detail: `${email} is already a user in this organization.`,
      });
    }

    const user = await this.prisma.orgUser.create({
      data: {
        organizationId,
        email,
        name: input.name.trim(),
        status: "invited",
        memberships: {
          create: input.memberships.map((g) => ({
            role: g.role as OrgRole,
            orgUnitId: g.org_unit_id ?? null,
          })),
        },
      },
    });

    const invite = await this.issueInvite(organizationId, user.id, user.email, user.name);
    return { id: user.id, email: user.email, name: user.name, invite };
  }

  async update(organizationId: string, userId: string, input: OrgUserUpdate) {
    const user = await this.prisma.orgUser.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) throw new NotFoundException("User not found");

    // Disabling the last active org-wide admin would lock everyone out of
    // user and structure management with no way back in through the UI.
    if (input.status === "disabled") {
      await this.assertNotLastAdmin(organizationId, { excludeUserId: userId });
    }

    return this.prisma.orgUser.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      select: { id: true, name: true, status: true },
    });
  }

  async addMembership(
    organizationId: string,
    userId: string,
    access: Access,
    grant: MembershipGrant,
  ) {
    this.assertCanGrant(access, grant);
    const user = await this.prisma.orgUser.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) throw new NotFoundException("User not found");

    if (grant.org_unit_id) {
      const unit = await this.prisma.orgUnit.findFirst({
        where: { id: grant.org_unit_id, organizationId },
      });
      if (!unit) throw new NotFoundException("Org unit not found");
    }

    try {
      return await this.prisma.orgMembership.create({
        data: {
          orgUserId: userId,
          orgUnitId: grant.org_unit_id ?? null,
          role: grant.role as OrgRole,
        },
        select: { id: true, role: true, orgUnitId: true },
      });
    } catch {
      throw new ConflictException({
        code: "grant_exists",
        detail: "That role is already granted at that scope.",
      });
    }
  }

  async removeMembership(
    organizationId: string,
    userId: string,
    membershipId: string,
    access: Access,
  ) {
    const membership = await this.prisma.orgMembership.findFirst({
      where: { id: membershipId, orgUserId: userId, orgUser: { organizationId } },
    });
    if (!membership) throw new NotFoundException("Grant not found");

    this.assertCanGrant(access, {
      role: membership.role,
      org_unit_id: membership.orgUnitId,
    });

    if (membership.role === "org_admin" && membership.orgUnitId === null) {
      await this.assertNotLastAdmin(organizationId, { excludeMembershipId: membershipId });
    }

    await this.prisma.orgMembership.delete({ where: { id: membershipId } });
    return { ok: true };
  }

  /** Re-issue an activation link (previous unused invites are revoked). */
  async reinvite(organizationId: string, userId: string): Promise<Invite> {
    const user = await this.prisma.orgUser.findFirst({
      where: { id: userId, organizationId },
    });
    if (!user) throw new NotFoundException("User not found");
    if (user.status === "disabled") {
      throw new BadRequestException({
        code: "user_disabled",
        detail: "Re-enable the user before sending a new invitation.",
      });
    }
    return this.issueInvite(organizationId, user.id, user.email, user.name);
  }

  private issueInvite(
    organizationId: string,
    orgUserId: string,
    email: string,
    name: string,
  ): Promise<Invite> {
    return this.invites.issue({ organizationId, orgUserId, email, name });
  }

  /**
   * A grant may never exceed the granter's own scope: you cannot hand out
   * org-wide access from a unit-scoped admin seat, nor grant into a subtree
   * you don't administer.
   */
  private assertCanGrant(access: Access, grant: MembershipGrant): void {
    if (!access.canGrantAt("org.manage_users", grant.org_unit_id ?? null)) {
      throw new ForbiddenException({
        code: "grant_exceeds_scope",
        detail:
          "You can only grant roles within the part of the organization you administer.",
      });
    }
  }

  /** Guard the last active org-wide admin against removal or disabling. */
  private async assertNotLastAdmin(
    organizationId: string,
    exclude: { excludeUserId?: string; excludeMembershipId?: string },
  ): Promise<void> {
    const remaining = await this.prisma.orgMembership.count({
      where: {
        role: "org_admin",
        orgUnitId: null,
        orgUser: { organizationId, status: "active" },
        ...(exclude.excludeUserId ? { orgUserId: { not: exclude.excludeUserId } } : {}),
        ...(exclude.excludeMembershipId ? { id: { not: exclude.excludeMembershipId } } : {}),
      },
    });
    if (remaining === 0) {
      throw new BadRequestException({
        code: "last_admin",
        detail:
          "This is the last organization-wide admin. Grant admin to someone else first.",
      });
    }
  }
}
