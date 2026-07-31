import { createHmac } from "node:crypto";
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import type { NotificationDelivery } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "./mail.service";

const SWEEP_INTERVAL_MS = 30_000;
/** Exponential-ish backoff per attempt; after the last step → dead letter. */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000];
const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/**
 * Drains notification_delivery rows (docs/05 §5). DB is truth: enqueue is
 * transactional with the event, attempts are claimed atomically (safe across
 * restarts/instances), failures reschedule with backoff, exhaustion → dead
 * (admin-retryable via POST /notification-deliveries/:id/retry).
 */
@Injectable()
export class DeliveryWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.drain(), SWEEP_INTERVAL_MS);
    void this.drain();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Attempt every due pending delivery. Safe to call any time. */
  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const due = await this.prisma.notificationDelivery.findMany({
        where: { status: "pending", nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: "asc" },
        take: 50,
      });
      for (const delivery of due) {
        // Atomic claim: bump attempts + push nextAttemptAt before trying, so
        // a concurrent worker (or crash mid-send) can't double-deliver.
        const attempt = delivery.attempts + 1;
        const backoff = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]!;
        const claim = await this.prisma.notificationDelivery.updateMany({
          where: { id: delivery.id, status: "pending", attempts: delivery.attempts },
          data: {
            attempts: attempt,
            nextAttemptAt: new Date(Date.now() + backoff),
          },
        });
        if (claim.count !== 1) continue;

        const error = await this.attempt(delivery);
        if (error === null) {
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: { status: "delivered", deliveredAt: new Date(), lastError: null },
          });
        } else {
          const dead = attempt >= MAX_ATTEMPTS;
          await this.prisma.notificationDelivery.update({
            where: { id: delivery.id },
            data: { lastError: error.slice(0, 500), ...(dead ? { status: "dead" } : {}) },
          });
          this.logger.warn(
            `delivery ${delivery.id.slice(0, 8)} (${delivery.channel} → ${delivery.target}) attempt ${attempt} failed${dead ? " — DEAD LETTER" : `, retry in ${Math.round(backoff / 1000)}s`}: ${error}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`drain failed: ${(err as Error).message}`);
    } finally {
      this.draining = false;
    }
  }

  /** Returns null on success, error string on failure. */
  private async attempt(delivery: NotificationDelivery): Promise<string | null> {
    const body = delivery.body as Record<string, unknown>;
    try {
      switch (delivery.channel) {
        case "email": {
          const ok = await this.mail.send(
            body.to as string[],
            body.subject as string,
            body.text as string,
          );
          return ok ? null : "smtp send failed";
        }
        case "slack":
        case "teams":
          return this.post(delivery.target, JSON.stringify({ text: body.text }), {});
        case "webhook": {
          const endpoint = delivery.endpointId
            ? await this.prisma.webhookEndpoint.findUnique({
                where: { id: delivery.endpointId },
              })
            : null;
          if (!endpoint || !endpoint.active) return "endpoint removed or inactive";
          const raw = JSON.stringify(body);
          const signature = createHmac("sha256", endpoint.secret).update(raw).digest("hex");
          return this.post(endpoint.url, raw, {
            "X-InterVU-Signature": `sha256=${signature}`,
          });
        }
      }
    } catch (err) {
      return (err as Error).message;
    }
  }

  private async post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<string | null> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok ? null : `HTTP ${res.status}`;
    } catch (err) {
      return (err as Error).message;
    }
  }
}
