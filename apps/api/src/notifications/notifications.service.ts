import { createHmac } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Org-facing notification fan-out. Channels are configured PER ORGANIZATION
 * (settings.notifications) — InterVU never assumes a specific provider:
 *   slack_webhook_url  → Slack incoming webhook
 *   teams_webhook_url  → Microsoft Teams incoming webhook
 *   registered webhook_endpoints → HMAC-signed JSON to anything else
 *   email_enabled      → gates outbound SMTP (vendor-facing mail)
 * Fire-and-forget with logging; per-endpoint retry/delivery log is a later
 * M4 increment tracked in docs/06 §4.
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

  constructor(private readonly prisma: PrismaService) {}

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

  /** Fan an event out to every configured org channel. Never throws. */
  async dispatch(event: OrgEvent): Promise<void> {
    try {
      const settings = await this.orgNotificationSettings(event.organizationId);

      const jobs: Promise<void>[] = [];
      if (settings.slack_webhook_url) {
        jobs.push(
          this.post(settings.slack_webhook_url, {
            text: `*${event.title}*\n${event.text}`,
          }, "slack"),
        );
      }
      if (settings.teams_webhook_url) {
        jobs.push(
          this.post(settings.teams_webhook_url, {
            text: `**${event.title}**\n\n${event.text}`,
          }, "teams"),
        );
      }

      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { organizationId: event.organizationId, active: true },
      });
      for (const ep of endpoints) {
        if (ep.events.length > 0 && !ep.events.includes(event.type)) continue;
        const body = JSON.stringify({
          event: event.type,
          title: event.title,
          text: event.text,
          payload: event.payload ?? {},
          sent_at: new Date().toISOString(),
        });
        const signature = createHmac("sha256", ep.secret).update(body).digest("hex");
        jobs.push(
          this.postRaw(ep.url, body, { "X-InterVU-Signature": `sha256=${signature}` }, "webhook"),
        );
      }

      await Promise.allSettled(jobs);
    } catch (err) {
      this.logger.error(`dispatch failed: ${(err as Error).message}`);
    }
  }

  private post(url: string, json: object, kind: string): Promise<void> {
    return this.postRaw(url, JSON.stringify(json), {}, kind);
  }

  private async postRaw(
    url: string,
    body: string,
    headers: Record<string, string>,
    kind: string,
  ): Promise<void> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) this.logger.warn(`${kind} channel responded ${res.status} (${url})`);
    } catch (err) {
      this.logger.warn(`${kind} channel unreachable (${url}): ${(err as Error).message}`);
    }
  }
}
