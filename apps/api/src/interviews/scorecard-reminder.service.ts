import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SlaService } from "../sla/sla.service";
import {
  LOOKBACK_HOURS,
  FRESH_AFTER_HOURS,
  type Reminder,
  reminderDue,
  reminderEmail,
} from "./scorecard-reminders";

const SWEEP_INTERVAL_MS = 5 * 60_000;

/**
 * Emails panelists who owe a scorecard (schedule: scorecard-reminders.ts).
 *
 * Before this nothing told an interviewer a scorecard was due: they found out
 * by opening the app, and a debrief waits on its slowest panelist.
 *
 * Same shape as the release notifier: a sweep on an interval, each reminder
 * claimed atomically on its panelist row before it is queued, and the email
 * itself sent by the durable delivery worker, which retries SMTP failures.
 * Organizations can turn it off with settings.notifications.scorecard_reminders
 * = false; it also follows email_enabled.
 */
@Injectable()
export class ScorecardReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScorecardReminderService.name);
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sla: SlaService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    void this.sweep();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Send every reminder that is due and not yet sent. Safe to call any time. */
  async sweep(now = new Date()): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    let sent = 0;
    try {
      // Every seat whose interview has started, inside the lookback window,
      // on an undecided application, with no scorecard from that seat yet.
      const seats = await this.prisma.interviewPanelist.findMany({
        where: {
          OR: [{ reminderFreshAt: null }, { reminderOverdueAt: null }],
          orgUser: { status: "active" },
          interview: {
            status: { in: ["scheduled", "completed"] },
            scheduledAt: {
              lte: new Date(now.getTime() - FRESH_AFTER_HOURS * 3_600_000),
              gte: new Date(now.getTime() - (LOOKBACK_HOURS + 24) * 3_600_000),
            },
            application: { decision: null },
          },
        },
        include: {
          orgUser: { select: { id: true, name: true, email: true } },
          interview: {
            include: {
              panelists: { select: { orgUserId: true } },
              scorecards: { select: { orgUserId: true } },
              application: {
                include: {
                  candidate: { select: { displayName: true } },
                  position: { select: { title: true, reference: true } },
                },
              },
            },
          },
        },
        take: 200,
      });

      const dueByOrg = new Map<string, number>();
      const enabledByOrg = new Map<string, boolean>();

      for (const seat of seats) {
        const i = seat.interview;
        if (i.scorecards.some((s) => s.orgUserId === seat.orgUserId)) continue;

        const orgId = i.organizationId;
        if (!enabledByOrg.has(orgId)) enabledByOrg.set(orgId, await this.enabled(orgId));
        if (!enabledByOrg.get(orgId)) continue;
        if (!dueByOrg.has(orgId)) {
          dueByOrg.set(orgId, (await this.sla.thresholds(orgId)).scorecard_due);
        }
        const dueHours = dueByOrg.get(orgId)!;

        const endsAt = new Date(i.scheduledAt.getTime() + i.durationMin * 60_000);
        const kind = reminderDue({
          endsAt,
          now,
          dueHours,
          freshSent: seat.reminderFreshAt !== null,
          overdueSent: seat.reminderOverdueAt !== null,
        });
        if (!kind) continue;
        if (!(await this.claim(seat.id, kind, now))) continue;

        const p = i.application.position;
        const { subject, text } = reminderEmail({
          name: seat.orgUser.name,
          candidate: i.application.candidate.displayName,
          round: i.roundName,
          position: p.reference ? `${p.reference} ${p.title}` : p.title,
          dueHours,
          kind,
          panelSize: i.panelists.length,
          panelFiled: i.scorecards.length,
          link: `${process.env.WEB_ORIGIN ?? "http://localhost:3000"}/interviews/${i.id}/room`,
        });
        await this.notifications.enqueueEmail(
          orgId,
          [seat.orgUser.email],
          subject,
          text,
          `scorecard.reminder_${kind}`,
        );
        await this.prisma.auditLog.create({
          data: {
            organizationId: orgId,
            actorType: "system",
            event: `notification.scorecard_reminder_${kind}`,
            entityType: "interview",
            entityId: i.id,
            payload: { orgUserId: seat.orgUserId },
          },
        });
        sent += 1;
      }
    } catch (err) {
      this.logger.error(`scorecard reminder sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
    return sent;
  }

  /**
   * Mark the reminder sent before queuing it; only the caller whose update
   * matched sends. An overdue reminder also closes the fresh one, so a seat
   * first seen past the due line never gets the "while it is fresh" email.
   */
  private async claim(seatId: string, kind: Reminder, now: Date): Promise<boolean> {
    if (kind === "fresh") {
      const res = await this.prisma.interviewPanelist.updateMany({
        where: { id: seatId, reminderFreshAt: null },
        data: { reminderFreshAt: now },
      });
      return res.count === 1;
    }
    const res = await this.prisma.interviewPanelist.updateMany({
      where: { id: seatId, reminderOverdueAt: null },
      data: { reminderOverdueAt: now },
    });
    if (res.count !== 1) return false;
    await this.prisma.interviewPanelist.updateMany({
      where: { id: seatId, reminderFreshAt: null },
      data: { reminderFreshAt: now },
    });
    return true;
  }

  private async enabled(organizationId: string): Promise<boolean> {
    const settings = await this.notifications.orgNotificationSettings(organizationId);
    return settings.email_enabled !== false && settings.scorecard_reminders !== false;
  }
}
