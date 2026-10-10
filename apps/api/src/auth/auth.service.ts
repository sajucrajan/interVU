import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WITH_ROLES, resolveMemberships } from "../entitlements/membership";
import {
  type Persona,
  membershipsFor,
  personasFor,
  resolvePersona,
} from "../entitlements/persona";
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
    const session = await this.createSession({ orgUserId: user!.id, organizationId: org!.id });
    // Which job to open on. One persona needs no choice; a remembered default
    // is honoured unless the person asked to be asked; otherwise the web
    // sends them to the picker before anything else.
    const personas = await this.personasOf(user!.id, org!.id);
    const persona = resolvePersona(personas, {
      stored: null,
      preferred: user!.defaultPersona,
      askEachTime: user!.askPersonaAtLogin,
    });
    if (persona) {
      await this.prisma.session.update({
        where: { tokenHash: sha256(session.token) },
        data: { persona: persona.key },
      });
    }
    return { ...session, persona, personas };
  }

  /**
   * Every persona this person can act as, from their grants and panel seats
   * (entitlements/persona.ts). Unit names make the picker say "Engineering"
   * rather than an id.
   */
  async personasOf(orgUserId: string, organizationId: string): Promise<Persona[]> {
    const [user, seats, units] = await Promise.all([
      this.prisma.orgUser.findUnique({ where: { id: orgUserId }, include: WITH_ROLES }),
      this.prisma.interviewPanelist.count({
        where: { orgUserId, interview: { organizationId } },
      }),
      this.prisma.orgUnit.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      }),
    ]);
    if (!user) return [];
    return personasFor(
      resolveMemberships(user.memberships),
      seats > 0,
      new Map(units.map((u) => [u.id, u.name])),
    );
  }

  /** Switch the session to another of the caller's personas. */
  async setPersona(token: string, key: string): Promise<Persona> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      select: { orgUserId: true, organizationId: true },
    });
    if (!session?.orgUserId || !session.organizationId) {
      throw new UnauthorizedException({ code: "not_authenticated" });
    }
    const persona = (await this.personasOf(session.orgUserId, session.organizationId)).find(
      (p) => p.key === key,
    );
    if (!persona) {
      throw new BadRequestException({
        code: "unknown_persona",
        detail: "You do not hold that persona.",
      });
    }
    await this.prisma.session.update({
      where: { tokenHash: sha256(token) },
      data: { persona: persona.key },
    });
    return persona;
  }

  /** "Open as X next time", or "ask me every time". */
  async setPersonaPreference(
    orgUserId: string,
    pref: { default_persona?: string | null; ask_at_login?: boolean },
  ) {
    const user = await this.prisma.orgUser.update({
      where: { id: orgUserId },
      data: {
        ...(pref.default_persona !== undefined ? { defaultPersona: pref.default_persona } : {}),
        ...(pref.ask_at_login !== undefined ? { askPersonaAtLogin: pref.ask_at_login } : {}),
      },
      select: { defaultPersona: true, askPersonaAtLogin: true },
    });
    return { default_persona: user.defaultPersona, ask_at_login: user.askPersonaAtLogin };
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
        orgUser: { include: WITH_ROLES },
        vendorUser: { include: { vendor: true } },
      },
    });
    if (!session || session.expiresAt < new Date()) return null;

    if (session.orgUser && session.orgUser.status === "active") {
      const user = session.orgUser;
      const all = resolveMemberships(user.memberships);
      const personas = await this.personasOf(user.id, user.organizationId);
      const persona = resolvePersona(personas, {
        stored: session.persona,
        preferred: user.defaultPersona,
        askEachTime: user.askPersonaAtLogin,
      });
      return {
        org: {
          organizationId: user.organizationId,
          user,
          memberships: membershipsFor(persona, all),
          allMemberships: all,
          persona,
          personas,
        },
      };
    }
    if (session.vendorUser && session.vendorUser.status === "active") {
      // A vendor session without an org is from before org-scoping — reject
      // it rather than guess which organization it meant.
      if (!session.organizationId) return null;
      // The contract is re-checked on every request, not just at login:
      // suspending or terminating a vendor has to take effect immediately,
      // otherwise an open session keeps working for up to a week. Individual
      // vendor queries filter on this too — this is the backstop that covers
      // any that forget.
      const contract = await this.prisma.vendorOrg.findUnique({
        where: {
          vendorId_organizationId: {
            vendorId: session.vendorUser.vendorId,
            organizationId: session.organizationId,
          },
        },
        select: { status: true },
      });
      if (!contract || !["active", "invited"].includes(contract.status)) return null;
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
