/**
 * How long something has been sitting, coloured against the threshold that
 * matters in this context. The number that decides what you work on first is
 * how late the oldest thing is — so it belongs on the pipeline card, the
 * pipeline table, submission rows, the dashboard queue, the position list and
 * the match-review queue, all rendered by this one component.
 *
 * `aging` starts at 70% of the SLA, matching the sla_state derivation.
 */

export type AgeState = "ok" | "aging" | "breached";

/** Compact and scannable: 4h, 2d 3h, 11d. */
export function formatAge(hours: number): string {
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  if (days < 10 && rest > 0) return `${days}d ${rest}h`;
  return `${days}d`;
}

export function ageState(hours: number, slaHours?: number): AgeState {
  if (!slaHours) return "ok";
  if (hours >= slaHours) return "breached";
  if (hours >= slaHours * 0.7) return "aging";
  return "ok";
}

const TONE: Record<AgeState, string> = {
  ok: "var(--ok)",
  aging: "var(--warn)",
  breached: "var(--bad)",
};

export function AgePill({
  since,
  sla,
  label,
}: {
  /** When the clock started — ISO string or Date. */
  since: string | Date | null | undefined;
  /** Threshold in hours for this context; omit for a neutral age. */
  sla?: number;
  label?: string;
}) {
  if (!since) return <span className="muted">—</span>;
  const hours = (Date.now() - new Date(since).getTime()) / 3_600_000;
  const state = ageState(hours, sla);
  const title = sla
    ? `${formatAge(hours)} old · ${state === "breached" ? "past" : "within"} the ${sla}h target`
    : `${formatAge(hours)} old`;

  return (
    <span className={`age-pill age-${state}`} title={title}>
      <span className="age-dot" style={{ background: TONE[state] }} aria-hidden />
      {label ? `${label} ` : ""}
      {formatAge(hours)}
    </span>
  );
}
