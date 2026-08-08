"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { SectionHead } from "@/components/section-head";

interface Perf {
  range: string;
  hero: {
    median_time_to_offer_days: number | null;
    median_time_to_offer_delta: number | null;
    median_time_to_offer_spark: (number | null)[];
    time_to_first_submission_days: number | null;
    time_to_first_submission_delta: number | null;
    time_to_first_submission_spark: (number | null)[];
    offer_accept_rate: number | null;
    offer_accept_rate_delta: number | null;
    duplicates_blocked: number;
    duplicates_blocked_delta: number;
    duplicates_blocked_spark: (number | null)[];
  };
  funnel: { stage: string; count: number; median_dwell_hours: number | null }[];
  leak: { from: string; to: string; lost_pct: number; dwell_days: number | null } | null;
  vendors: {
    id: string;
    name: string;
    tier: number;
    since: number;
    submissions: number;
    quality: number;
    offer_rate: number;
    dropout_rate: number | null;
  }[];
  breaches: { key: string; label: string; count: number; over_hours: number; href: string }[];
  demand: { team: string; open_headcount: number; in_flight: number }[];
}

const RANGES = [
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "12mo", label: "12mo" },
];

const STAGE_LABEL: Record<string, string> = {
  submitted: "Submitted",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  hired: "Hired",
};

const days = (h: number | null) => (h === null ? "—" : `${(h / 24).toFixed(1)}d`);

/** Inline polyline; vector-effect keeps the stroke 1px at any width. */
function Spark({ points, color }: { points: (number | null)[]; color: string }) {
  const real = points.filter((p): p is number => p !== null);
  if (real.length < 2) return <div className="spark-empty" />;
  const min = Math.min(...real);
  const max = Math.max(...real);
  const span = max - min || 1;
  const step = 200 / (points.length - 1);
  const path = points
    .map((p, i) => (p === null ? null : `${i * step},${34 - ((p - min) / span) * 30}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg className="spark" viewBox="0 0 200 38" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Hero({
  label,
  value,
  unit,
  delta,
  good,
  spark,
  color,
  note,
  unavailable,
}: {
  label: string;
  value: string;
  unit: string;
  delta?: string | null;
  good?: boolean;
  spark?: (number | null)[];
  color: string;
  note?: string;
  /** The metric cannot be computed at all, as opposed to merely lacking a
   *  prior window to compare against. The two must not read the same. */
  unavailable?: boolean;
}) {
  return (
    <div className="hero-stat" title={note}>
      <div className="mono-label">{label}</div>
      <div className="hero-value">
        <span className="figure">{value}</span>
        <span className="hero-unit">{unit}</span>
      </div>
      {delta ? (
        <div
          className="hero-delta"
          style={{ color: good ? "var(--ok)" : "var(--bad)" }}
        >
          {delta}
        </div>
      ) : (
        <div className="hero-delta muted">
          {unavailable ? "not tracked yet" : "no prior period"}
        </div>
      )}
      {spark && <Spark points={spark} color={color} />}
    </div>
  );
}

export function HiringPerformance() {
  const [range, setRange] = useState("90d");
  const [d, setD] = useState<Perf | null>(null);

  useEffect(() => {
    api<Perf>(`/analytics/performance?range=${range}`)
      .then(setD)
      .catch(() => setD(null));
  }, [range]);

  if (!d) return <p className="muted">Loading…</p>;

  const submitted = d.funnel[0]?.count ?? 0;
  const maxHeadcount = Math.max(1, ...d.demand.map((x) => x.open_headcount));
  const maxFlight = Math.max(1, ...d.demand.map((x) => x.in_flight));

  return (
    <>
      <header className="page-head">
        <div>
          <div className="mono-label">Rolling {range} · your scope</div>
          <h1 style={{ marginTop: 12 }}>Hiring performance</h1>
        </div>
        <div className="range-chips">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`range-chip${range === r.key ? " active" : ""}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {/* ---- four hero figures, separated by rules rather than cards ---- */}
      <div className="hero-row">
        <Hero
          label="Median time to offer"
          value={d.hero.median_time_to_offer_days?.toString() ?? "—"}
          unit="days"
          delta={
            d.hero.median_time_to_offer_delta === null
              ? null
              : `${d.hero.median_time_to_offer_delta <= 0 ? "▼" : "▲"} ${Math.abs(d.hero.median_time_to_offer_delta)}d vs prior ${range}`
          }
          good={(d.hero.median_time_to_offer_delta ?? 0) <= 0}
          spark={d.hero.median_time_to_offer_spark}
          color="var(--ok)"
          note="Time to OFFER — offer acceptance is not modelled yet, so this is not time-to-hire."
        />
        <Hero
          label="Time to first submission"
          value={d.hero.time_to_first_submission_days?.toString() ?? "—"}
          unit="days"
          delta={
            d.hero.time_to_first_submission_delta === null
              ? null
              : `${d.hero.time_to_first_submission_delta <= 0 ? "▼" : "▲"} ${Math.abs(d.hero.time_to_first_submission_delta)}d vs prior ${range}`
          }
          good={(d.hero.time_to_first_submission_delta ?? 0) <= 0}
          spark={d.hero.time_to_first_submission_spark}
          color="var(--bad)"
          note="Release to first valid submission — whether a release policy works."
        />
        <Hero
          label="Offer accept rate"
          value={d.hero.offer_accept_rate?.toString() ?? "—"}
          unit="%"
          delta={null}
          color="var(--ok)"
          unavailable={d.hero.offer_accept_rate === null}
          note="Accepted ÷ closed offers. An offer still open is not yet a decline."
        />
        <Hero
          label="Duplicates blocked"
          value={String(d.hero.duplicates_blocked)}
          unit="subs"
          delta={`${d.hero.duplicates_blocked_delta >= 0 ? "▲" : "▼"} ${Math.abs(d.hero.duplicates_blocked_delta)} vs prior ${range}`}
          good
          spark={d.hero.duplicates_blocked_spark}
          color="var(--accent)"
        />
      </div>

      <div className="perf-split">
        <div>
          <SectionHead label="Funnel · conversion & dwell" />
          {d.funnel.map((s, i) => {
            const prev = d.funnel[i - 1];
            const unknown = s.count < 0;
            const width = submitted ? Math.max(2, (s.count / submitted) * 100) : 0;
            const conv =
              prev && prev.count > 0 && !unknown && i > 0
                ? Math.round((s.count / prev.count) * 100)
                : null;
            const last = s.stage === "offer";
            return (
              <div key={s.stage} className="funnel-row">
                <div>
                  <div className="funnel-label">{STAGE_LABEL[s.stage]}</div>
                  <div className="mono-label">median {days(s.median_dwell_hours)}</div>
                </div>
                <div className="funnel-bar-wrap">
                  {unknown ? (
                    <span className="muted funnel-unknown">not tracked</span>
                  ) : (
                    <span
                      className="funnel-bar figure"
                      style={{
                        width: `${width}%`,
                        background: last ? "var(--fg)" : "var(--accent)",
                        color: last ? "var(--page)" : "var(--accent-ink)",
                      }}
                    >
                      {s.count}
                    </span>
                  )}
                  {conv !== null && (
                    <span
                      className="funnel-conv"
                      style={{ color: conv < 60 ? "var(--warn)" : "var(--muted)" }}
                    >
                      {conv}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {d.leak && (
            <div className="leak">
              <div className="mono-label">Biggest leak</div>
              <p>
                {STAGE_LABEL[d.leak.from]} → {STAGE_LABEL[d.leak.to]} loses{" "}
                <strong>{d.leak.lost_pct}%</strong>
                {d.leak.dwell_days !== null && (
                  <>
                    {" "}
                    and holds candidates a median of{" "}
                    <strong>{d.leak.dwell_days} days</strong>
                  </>
                )}
                .
              </p>
            </div>
          )}
        </div>

        <div>
          <SectionHead
            label="Vendor quality index"
            action={
              <span className="mono-label">accept × interview × offer, dropout-penalised</span>
            }
          />
          <table className="data">
            <thead>
              <tr>
                <th>Vendor</th>
                <th className="num">Subs</th>
                <th>Quality</th>
                <th className="num">Offer%</th>
                <th className="num">Drop%</th>
              </tr>
            </thead>
            <tbody>
              {d.vendors.map((v) => {
                const tone =
                  v.quality >= 70 ? "var(--ok)" : v.quality >= 40 ? "var(--warn)" : "var(--bad)";
                return (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                      <span className="row-sub mono-label">
                        tier {v.tier} · since {v.since}
                      </span>
                    </td>
                    <td className="num">{v.submissions}</td>
                    <td>
                      <span className="match-cell">
                        <span className="quality-track">
                          <span style={{ width: `${v.quality}%`, background: tone }} />
                        </span>
                        <span className="figure quality-score" style={{ color: tone }}>
                          {v.quality}
                        </span>
                      </span>
                    </td>
                    <td className="num">{(v.offer_rate * 100).toFixed(1)}%</td>
                    <td className="num">
                      {v.dropout_rate === null
                        ? "—"
                        : `${(v.dropout_rate * 100).toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <SectionHead
            label="SLA breaches"
            action={<Link href="/pipeline">Work the list</Link>}
          />
          {d.breaches.length === 0 ? (
            <p className="muted">Nothing is past its threshold.</p>
          ) : (
            d.breaches.map((b) => (
              <Link key={b.key} href={b.href} className="breach-row">
                <span className="breach-label">{b.label}</span>
                <span className="breach-over">
                  up to {Math.round(b.over_hours / 24)}d over
                </span>
                <span className="figure breach-n">{b.count}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      <section>
        <SectionHead
          label="Demand vs supply, by team"
          action={
            <span className="mono-label">
              bar = open headcount · line = candidates in flight
            </span>
          }
        />
        <div className="demand-row">
          {d.demand.map((t) => (
            <div key={t.team} className="demand-col">
              <div className="demand-plot">
                <div
                  className="demand-bar"
                  style={{ height: `${(t.open_headcount / maxHeadcount) * 100}%` }}
                />
                <div
                  className="demand-line"
                  style={{
                    bottom: `${(t.in_flight / maxFlight) * 100}%`,
                    borderColor:
                      t.in_flight >= t.open_headcount * 2
                        ? "var(--ok)"
                        : t.in_flight >= t.open_headcount
                          ? "var(--warn)"
                          : "var(--bad)",
                  }}
                />
              </div>
              <div className="demand-name">{t.team}</div>
              <div className="mono-label">
                {t.open_headcount} open · {t.in_flight} in flight
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
