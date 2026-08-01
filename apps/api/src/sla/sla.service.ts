import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type SlaEvent =
  | "first_screen"
  | "scorecard_due"
  | "decision_due"
  | "vendor_ack";

export type SlaState = "ok" | "aging" | "breached";

/** Used when an organization has no row yet (e.g. created before this table). */
export const SLA_DEFAULTS: Record<SlaEvent, number> = {
  first_screen: 48,
  scorecard_due: 24,
  decision_due: 72,
  vendor_ack: 24,
};

/** Aging starts at 70% of the threshold — the warning arrives before the miss. */
export const AGING_FRACTION = 0.7;

@Injectable()
export class SlaService {
  constructor(private readonly prisma: PrismaService) {}

  async thresholds(organizationId: string): Promise<Record<SlaEvent, number>> {
    const rows = await this.prisma.slaPolicy.findMany({ where: { organizationId } });
    const out = { ...SLA_DEFAULTS };
    for (const r of rows) {
      if (r.event in out) out[r.event as SlaEvent] = r.thresholdHours;
    }
    return out;
  }

  /**
   * Derived, never stored: editing a threshold re-colours everything at once
   * rather than leaving stale states behind.
   */
  static state(hours: number, threshold: number): SlaState {
    if (hours >= threshold) return "breached";
    if (hours >= threshold * AGING_FRACTION) return "aging";
    return "ok";
  }

  static hoursSince(at: Date | string, now = Date.now()): number {
    return (now - new Date(at).getTime()) / 3_600_000;
  }
}

/** Median, not mean — one six-month req should not move the headline number. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
