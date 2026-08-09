"use client";

/**
 * The submission funnel, drawn once.
 *
 * Used by the agency looking at itself and by the client comparing agencies,
 * because they are looking at the same numbers from the same computation —
 * the whole point of the feature. A vendor review that opens with two
 * different submission counts spends its hour on reconciliation.
 */

export interface Funnel {
  submitted: number;
  accepted: number;
  screened: number;
  interviewed: number;
  offered: number;
  duplicate: number;
  rejected_at_screening: number;
  rejected_after_interview: number;
  in_flight: number;
}

export interface Rates {
  accept: number | null;
  screen_through: number | null;
  offer: number | null;
  end_to_end: number | null;
}

export const pct = (r: number | null) =>
  r === null ? "—" : `${Math.round(r * 100)}%`;

/** A rate with its own arithmetic shown, so nobody has to trust the label. */
export function RateTile({
  label,
  value,
  num,
  den,
  hint,
  delta,
}: {
  label: string;
  value: number | null;
  num: number;
  den: number;
  hint: string;
  delta?: number | null;
}) {
  const dir = delta == null ? null : delta > 0.005 ? "up" : delta < -0.005 ? "down" : "flat";
  return (
    <div className="rate-tile">
      <div className="mono-label">{label}</div>
      <div className="figure rate-figure">{pct(value)}</div>
      {/* The fraction, always. A conversion rate with no denominator is how
          one placement out of two becomes "50% success" in a pitch deck. */}
      <div className="mono-label rate-frac">
        {num} of {den}
      </div>
      {dir && (
        <div className={`rate-delta ${dir}`}>
          {dir === "flat"
            ? "level on the period before"
            : `${dir === "up" ? "▲" : "▼"} ${Math.abs(Math.round(delta! * 100))} pts vs previous`}
        </div>
      )}
      <p className="muted rate-hint">{hint}</p>
    </div>
  );
}

/**
 * The funnel as proportional bars.
 *
 * Every bar is scaled against `submitted`, not against the step before it, so
 * the drop between stages is visible as area rather than requiring the reader
 * to divide two numbers in their head.
 */
export function FunnelBars({ funnel }: { funnel: Funnel }) {
  const max = Math.max(funnel.submitted, 1);
  const steps: { key: keyof Funnel; label: string; tone?: string }[] = [
    { key: "submitted", label: "Submitted" },
    { key: "accepted", label: "Accepted" },
    { key: "screened", label: "Screened" },
    { key: "interviewed", label: "Interviewed" },
    { key: "offered", label: "Offered", tone: "ok" },
  ];
  return (
    <div className="funnel">
      {steps.map((s) => {
        const v = funnel[s.key];
        return (
          <div key={s.key} className="funnel-row">
            <div className="funnel-label mono-label">{s.label}</div>
            <div className="funnel-track">
              <div
                className={`funnel-bar${s.tone ? ` ${s.tone}` : ""}`}
                style={{ width: `${(v / max) * 100}%` }}
              />
            </div>
            <div className="funnel-value figure">{v}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where the candidates went who did not get an offer.
 *
 * Separated from the funnel because the funnel answers "how many got
 * through" and this answers "what did the failures cost". A rejection at
 * screening costs a recruiter ten minutes; one after a panel costs three
 * people an hour each, and an agency whose losses are concentrated there is
 * expensive in a way the headline conversion rate hides.
 */
export function LossBreakdown({ funnel }: { funnel: Funnel }) {
  const rows = [
    {
      label: "Already claimed by another agency",
      value: funnel.duplicate,
      hint: "Same candidate, someone else got there first.",
    },
    {
      label: "Turned down at screening",
      value: funnel.rejected_at_screening,
      hint: "Before anyone spent an interview hour.",
    },
    {
      label: "Turned down after interviewing",
      value: funnel.rejected_after_interview,
      hint: "The expensive kind — a panel had already met them.",
    },
    {
      label: "Still moving",
      value: funnel.in_flight,
      hint: "Not a loss. Not yet a placement either.",
    },
  ];
  if (rows.every((r) => r.value === 0)) return null;
  return (
    <table className="data loss-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>
              {r.label}
              <br />
              <span className="muted loss-hint">{r.hint}</span>
            </td>
            <td className="loss-value figure">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Conversion by technology.
 *
 * The answer to "how do they do on Kubernetes roles specifically". An agency
 * strong on React and weak on platform work reads as merely average until the
 * numbers are split, and that average is what everybody argues about.
 */
export function SkillTable({
  rows,
}: {
  rows: {
    skill: string;
    submitted: number;
    interviewed: number;
    offered: number;
    screen_through: number | null;
  }[];
}) {
  if (!rows.length) {
    return (
      <p className="muted">
        No submissions in this period, so there is nothing to break down.
      </p>
    );
  }
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Technology</th>
          <th className="num">Submitted</th>
          <th className="num">Interviewed</th>
          <th className="num">Offered</th>
          <th className="num">Through to interview</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.skill}>
            <td>
              <span className="skill-chip">{r.skill}</span>
            </td>
            <td className="num">{r.submitted}</td>
            <td className="num">{r.interviewed}</td>
            <td className="num">{r.offered}</td>
            <td className="num">{pct(r.screen_through)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Window + filter controls, identical on both sides for the same reason. */
export function FunnelFilters({
  options,
  value,
  onChange,
}: {
  options: {
    windows: { key: string; label: string }[];
    positions: { id: string; reference: string; title: string }[];
    skills: string[];
    seniorities: string[];
  };
  value: { window: string; position: string; skill: string; seniority: string };
  onChange: (next: Partial<typeof value>) => void;
}) {
  return (
    <div className="funnel-filters">
      <div className="win-tabs">
        {options.windows.map((w) => (
          <button
            key={w.key}
            type="button"
            className={`win-tab${value.window === w.key ? " active" : ""}`}
            onClick={() => onChange({ window: w.key })}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="funnel-selects">
        <label>
          <span className="mono-label">Role</span>
          <select
            value={value.position}
            onChange={(e) => onChange({ position: e.target.value })}
          >
            <option value="">All roles</option>
            {options.positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.reference} · {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mono-label">Technology</span>
          <select
            value={value.skill}
            onChange={(e) => onChange({ skill: e.target.value })}
          >
            <option value="">Any</option>
            {options.skills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mono-label">Seniority</span>
          <select
            value={value.seniority}
            onChange={(e) => onChange({ seniority: e.target.value })}
          >
            <option value="">Any</option>
            {options.seniorities.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
