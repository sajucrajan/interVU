import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenancy/tenant-context";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "intervu_session";
const SESSION_TTL_MS = 7 * 24 * 3_600_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async loginOrg(orgSlug: string, email: string, password: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });
    const user = org
      ? await this.prisma.orgUser.findUnique({
          where: { organizationId_email: { organizationId: org.id, email } },
        })
      : null;
    this.checkCredentials(user?.passwordHash, password, user?.status);
    return this.createSession({ orgUserId: user!.id, organizationId: org!.id });
  }

  /**
   * Vendor login is ALWAYS organization-scoped (docs/05 §1). A vendor is a
   * global identity that may serve several organizations; the credential
   * namespace is (organization, email), so an agency recruiter working with
   * two client orgs signs into each separately and a session can never span
   * organizations. Without the org, `email` alone is ambiguous across vendors.
   */
  async loginVendor(orgSlug: string, email: string, password: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });
    const user = org
      ? await this.prisma.vendorUser.findFirst({
          where: {
            email,
            passwordHash: { not: null },
            vendor: {
              vendorOrgs: {
                some: { organizationId: org.id, status: { in: ["active", "invited"] } },
              },
            },
          },
        })
      : null;
    this.checkCredentials(user?.passwordHash, password, user?.status);
    return this.createSession({ vendorUserId: user!.id, organizationId: org!.id });
  }

  /**
   * Describe a pending invitation so the activation page can greet the user.
   * Reveals only what the token holder already knows — their own name, email
   * and organization — and nothing at all for a bad or spent token.
   */
  async describeInvite(token: string) {
    const invite = await this.findLiveInvite(token);
    const org = await this.prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { name: true, slug: true },
    });
    const user = invite.orgUser ?? invite.vendorUser!;
    return {
      email: user.email,
      name: user.name,
      kind: invite.orgUserId ? "org" : "vendor",
      organization: { name: org?.name ?? "", slug: org?.slug ?? "" },
    };
  }

  /**
   * Redeem an invitation. Setting the password and marking the token spent
   * happen in one transaction, so a token can never be used twice — and every
   * other outstanding invite for that user is retired at the same time.
   */
  async activate(token: string, password: string) {
    const invite = await this.findLiveInvite(token);
    const passwordHash = hashPassword(password);

    await this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: two concurrent redemptions of the
      // same link must not both succeed.
      const claimed = await tx.inviteToken.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new BadRequestException({
          code: "invite_invalid",
          detail: "This invitation link is no longer valid.",
        });
      }
      if (invite.orgUserId) {
        await tx.orgUser.update({
          where: { id: invite.orgUserId },
          data: { passwordHash, status: "active" },
        });
      } else {
        await tx.vendorUser.update({
          where: { id: invite.vendorUserId! },
          data: { passwordHash, status: "active" },
        });
      }
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: invite.organizationId },
      select: { slug: true },
    });
    const user = invite.orgUser ?? invite.vendorUser!;
    // Enough for the web app to send them to the right sign-in form, prefilled.
    return {
      ok: true,
      kind: invite.orgUserId ? "org" : "vendor",
      email: user.email,
      org_slug: org?.slug ?? "",
    };
  }

  private async findLiveInvite(token: string) {
    const invite = await this.prisma.inviteToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        orgUser: { select: { email: true, name: true } },
        vendorUser: { select: { email: true, name: true } },
      },
    });
    // One error for missing, spent and expired alike — a probing caller learns
    // nothing about which tokens ever existed.
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException({
        code: "invite_invalid",
        detail: "This invitation link is invalid or has expired.",
      });
    }
    return invite;
  }

  private checkCredentials(
    passwordHash: string | null | undefined,
    password: string,
    status: string | undefined,
  ): void {
    // Uniform error: never reveal whether the account exists.
    const ok =
      !!passwordHash && status === "active" && verifyPassword(password, passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ code: "invalid_credentials" });
    }
  }

  private async createSession(owner: {
    orgUserId?: string;
    vendorUserId?: string;
    organizationId: string;
  }) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: { tokenHash: sha256(token), expiresAt, ...owner },
    });
    return { token, expiresAt };
  }

  /** Resolve a session token into a TenantContext, or null if invalid. */
  async resolveSession(token: string): Promise<TenantContext | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: {
        orgUser: { include: { memberships: true } },
        vendorUser: { include: { vendor: true } },
      },
    });
    if (!session || session.expiresAt < new Date()) return null;

    if (session.orgUser && session.orgUser.status === "active") {
      return {
        org: {
          organizationId: session.orgUser.organizationId,
          user: session.orgUser,
          memberships: session.orgUser.memberships.map((m) => ({
            role: m.role,
            orgUnitId: m.orgUnitId,
          })),
        },
      };
    }
    if (session.vendorUser && session.vendorUser.status === "active") {
      // A vendor session without an org is from before org-scoping — reject
      // it rather than guess which organization it meant.
      if (!session.organizationId) return null;
      return {
        vendor: {
          vendor: session.vendorUser.vendor,
          user: session.vendorUser,
          organizationId: session.organizationId,
        },
      };
    }
    return null;
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session
      .delete({ where: { tokenHash: sha256(token) } })
      .catch(() => undefined); // logging out an already-dead session is fine
  }
}
