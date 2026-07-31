import { createHash, randomBytes } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { TenantContext } from "../tenancy/tenant-context";
import { verifyPassword } from "./password";

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
    return this.createSession({ orgUserId: user!.id });
  }

  async loginVendor(email: string, password: string) {
    // Vendor emails are unique per vendor, not globally; a person recruiting
    // for two vendors needs distinct emails until account linking (M2).
    const user = await this.prisma.vendorUser.findFirst({
      where: { email, passwordHash: { not: null } },
    });
    this.checkCredentials(user?.passwordHash, password, user?.status);
    return this.createSession({ vendorUserId: user!.id });
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
      return {
        vendor: { vendor: session.vendorUser.vendor, user: session.vendorUser },
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
