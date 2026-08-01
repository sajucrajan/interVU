import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

/** Invites are short-lived; an unused link stops working after a week. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sha256 = (raw: string) => createHash("sha256").update(raw).digest("hex");

export interface Invite {
  /** The raw token — returned ONCE, never readable again from the database. */
  token: string;
  url: string;
  expiresAt: Date;
}

/**
 * Issues activation links for org users and vendor users alike. Both sides
 * redeem at the same public endpoint (`POST /auth/activate`), so the rules
 * that make the token safe live in exactly one place.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Mint a single-use token, store only its hash, and mail the link.
   *
   * The link is ALSO returned to the caller so an admin can pass it on
   * directly: deployments with no SMTP configured (log-only mode) would
   * otherwise be unable to onboard anyone. It deliberately does not go
   * through `dispatch()` — Slack/Teams channels have a wider audience than
   * the invitee, and this token is a credential.
   */
  async issue(params: {
    organizationId: string;
    orgUserId?: string;
    vendorUserId?: string;
    email: string;
    name: string;
  }): Promise<Invite> {
    const owner = params.orgUserId
      ? { orgUserId: params.orgUserId }
      : { vendorUserId: params.vendorUserId! };

    // One live invitation per user: issuing a new link retires the old one.
    await this.prisma.inviteToken.updateMany({
      where: { ...owner, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.inviteToken.create({
      data: {
        organizationId: params.organizationId,
        ...owner,
        tokenHash: sha256(token),
        expiresAt,
      },
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: params.organizationId },
      select: { name: true },
    });
    const orgName = org?.name ?? "your organization";
    const base = process.env.WEB_ORIGIN ?? "http://localhost:3000";
    const url = `${base}/activate?token=${token}`;

    const opening = params.vendorUserId
      ? `You've been invited to supply candidates to ${orgName} through InterVU.`
      : `You've been given access to InterVU for ${orgName}.`;

    await this.notifications.enqueueEmail(
      params.organizationId,
      [params.email],
      `Your InterVU account for ${orgName}`,
      [
        `Hi ${params.name},`,
        "",
        opening,
        "Set your password to get started:",
        "",
        url,
        "",
        "This link can be used once and expires in 7 days.",
      ].join("\n"),
      params.vendorUserId ? "vendor_user.invited" : "org_user.invited",
    );

    return { token, url, expiresAt };
  }
}
