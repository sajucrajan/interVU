import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DeliveryWorkerService } from "./delivery-worker.service";

/**
 * Org-facing notification fan-out. Channels are configured PER ORGANIZATION
 * (settings.notifications) — InterVU never assumes a specific provider:
 *   slack_webhook_url  → Slack incoming webhook
 *   teams_webhook_url  → Microsoft Teams incoming webhook
 *   registered webhook_endpoints → HMAC-signed JSON to anything else
 *   email_enabled      → gates outbound SMTP (vendor-facing mail)
 *
 * Dispatch is DURABLE: each channel send is persisted as a
 * notification_delivery row and drained by DeliveryWorkerService with
 * exponential backoff — a down channel delays a message, never loses it.
 */
export interface OrgEvent {
  organizationId: string;
  type: string; // e.g. position.released_to_vendor, submission.duplicate_flagged
  title: string;
  text: string;
  payload?: Record<string, unknown>;
}

export interface NotificationSettings {
  email_enabled?: boolean;
  slack_webhook_url?: string | null;
  teams_webhook_url?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: DeliveryWorkerService,
  ) {}

  async orgNotificationSettings(organizationId: string): Promise<NotificationSettings> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    return ((org?.settings as { notifications?: NotificationSettings })?.notifications) ?? {};
  }

  /** Vendor-facing email allowed? (default yes; org can turn it off) */
  async emailEnabled(organizationId: string): Promise<boolean> {
    return (await this.orgNotificationSettings(organizationId)).email_enabled !== false;
  }

  /** Enqueue a durable email delivery (drained with retry by the worker). */
  async enqueueEmail(
    organizationId: string,
    to: string[],
    subject: string,
    text: string,
    event: string,
  ): Promise<void> {
    if (to.length === 0) return;
    await this.prisma.notificationDelivery.create({
      data: {
        organizationId,
        channel: "email",
        target: `smtp (${to.length} recipient${to.length > 1 ? "s" : ""})`,
        event,
        body: { to, subject, text },
      },
    });
    void this.worker.drain();
  }

  /** Enqueue an event for every configured org channel. Never throws. */
  async dispatch(event: OrgEvent): Promise<void> {
    try {
      const settings = await this.orgNotificationSettings(event.organizationId);
      const rows: {
        channel: "slack" | "teams" | "webhook";
        target: string;
        endpointId?: string;
        body: object;
      }[] = [];

      if (settings.slack_webhook_url) {
        rows.push({
          channel: "slack",
          target: settings.slack_webhook_url,
          body: { text: `*${event.title}*\n${event.text}` },
        });
      }
      if (settings.teams_webhook_url) {
        rows.push({
          channel: "teams",
          target: settings.teams_webhook_url,
          body: { text: `**${event.title}**\n\n${event.text}` },
        });
      }
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { organizationId: event.organizationId, active: true },
      });
      for (const ep of endpoints) {
        if (ep.events.length > 0 && !ep.events.includes(event.type)) continue;
        rows.push({
          channel: "webhook",
          target: ep.url,
          endpointId: ep.id,
          body: {
            event: event.type,
            title: event.title,
            text: event.text,
            payload: event.payload ?? {},
          },
        });
      }
      if (rows.length === 0) return;

      await this.prisma.notificationDelivery.createMany({
        data: rows.map((r) => ({
          organizationId: event.organizationId,
          channel: r.channel,
          endpointId: r.endpointId,
          target: r.target,
          event: event.type,
          body: r.body as object,
        })),
      });
      void this.worker.drain();
    } catch (err) {
      this.logger.error(`dispatch failed: ${(err as Error).message}`);
    }
  }
}
