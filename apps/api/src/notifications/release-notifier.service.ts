import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "./mail.service";
import { NotificationsService } from "./notifications.service";

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Vendor release notifications, DB-is-truth style (docs/05 §5): the release
 * row's `visible_from` decides visibility at query time; this service only
 * announces it. Publish/manual-release trigger an immediate sweep; the
 * interval catches future tier unlocks. `notified_at` is claimed atomically,
 * so restarts and multiple instances never double-send. Losing a tick delays
 * an email, never a release.
 */
@Injectable()
export class ReleaseNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReleaseNotifierService.name);
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    void this.sweep();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Notify every due, un-notified release. Safe to call any time. */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const due = await this.prisma.positionVendorRelease.findMany({
        where: {
          notifiedAt: null,
          visibleFrom: { lte: new Date() },
          position: { status: "open" },
          vendorOrg: { status: "active" },
        },
        include: {
          position: {
            include: { organization: { select: { name: true } } },
          },
          vendorOrg: { include: { vendor: true } },
        },
        take: 100,
      });

      for (const release of due) {
        // Atomic claim: only the updater with count=1 sends.
        const claim = await this.prisma.positionVendorRelease.updateMany({
          where: { id: release.id, notifiedAt: null },
          data: { notifiedAt: new Date() },
        });
        if (claim.count !== 1) continue;

        const recipients = await this.prisma.vendorUser.findMany({
          where: { vendorId: release.vendorOrg.vendorId, status: "active" },
          select: { email: true },
        });
        const p = release.position;
        const rate =
          p.rateMin != null && p.rateMax != null
            ? `\nRate band: ${p.rateCurrency} ${p.rateMin}–${p.rateMax}${p.ratePeriod ? ` / ${p.ratePeriod}` : ""}`
            : "";
        // Vendor-facing email is org-toggleable (settings.notifications.
        // email_enabled); the portal always shows the release regardless.
        const emailOn = await this.notifications.emailEnabled(p.organizationId);
        const sent =
          emailOn &&
          (await this.mail.send(
            recipients.map((r) => r.email),
          `New position released to you: ${p.title} — ${p.organization.name}`,
          `Hello ${release.vendorOrg.vendor.name},

${p.organization.name} has released a position to you on InterVU:

  ${p.title}
  ${[p.seniority, p.employmentType?.replaceAll("_", " "), p.locationPolicy, p.locationText].filter(Boolean).join(" · ")}
  Openings: ${p.openings}${rate}

Review the full posting and submit candidates in your portal:
  ${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/vendor

— InterVU`,
          ));
        await this.prisma.auditLog.create({
          data: {
            organizationId: p.organizationId,
            actorType: "system",
            event: "notification.release_emailed",
            entityType: "position",
            entityId: p.id,
            payload: {
              vendorOrgId: release.vendorOrgId,
              recipients: recipients.length,
              delivered: sent,
              email_enabled: emailOn,
            },
          },
        });
        // Org-side channels (Slack/Teams/webhooks) hear about it too.
        void this.notifications.dispatch({
          organizationId: p.organizationId,
          type: "position.released_to_vendor",
          title: `Position released: ${p.title}`,
          text: `${p.title} is now visible to ${release.vendorOrg.vendor.name} (tier ${release.vendorOrg.tier}).`,
          payload: { position_id: p.id, vendor: release.vendorOrg.vendor.name },
        });
        this.logger.log(
          `release notice: "${p.title}" → ${release.vendorOrg.vendor.name} (email=${emailOn ? recipients.length : "off"})`,
        );
      }
    } catch (err) {
      this.logger.error(`sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }
}
