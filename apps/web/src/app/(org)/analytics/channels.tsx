"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SectionHead } from "@/components/section-head";

interface Row {
  key: string;
  label: string;
  direct: boolean;
  volume: number;
  interview_rate: number | null;
  hires: number;
  hire_rate: number | null;
  median_days_to_hire: number | null;
  cost_per_hire: number | null;
  cost_basis: string | null;
  retention_90d: number | null;
  retention_basis: string | null;
}

interface Channels {
  range: string;
  total: number;
  mix: { key: string; label: string; share: number }[];
  rows: Row[];
}

const RANGES = [
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "12mo", label: "12mo" },
];

const money = (n: number) =>
  n === 0 ? "€0" : `€${Math.round(n / 1000)}k`;

/**
 * Channel comparison (design option 2c).
 *
 * The point of the table is the last two columns. Volume and hire rate flatter
 * whichever channel sends the most resumes; cost per hire and 90-day retention
 * are what let someone argue for moving budget from agencies to a careers page,
 * or the reverse. Where the input isn't recorded yet the cell says why instead
 * of showing a number, because a made-up cost here would move real money.
 */
export function ChannelComparison() {
  const [data, setData] = useState<Channels | null>(null);
  const [range, setRange] = useState("90d");

  useEffect(() => {
    let live = true;
    api<Channels>(`/analytics/channels?range=${range}`)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [range]);

  if (!data || data.rows.length === 0) return null;

  return (
    <section className="channel-block">
      <div className="section-head-row">
        <SectionHead label="Where hires come from" />
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
      </div>

      {/* Intake mix: the denominator, so no rate below is read without it. */}
      <div className="mix-bar" aria-label="Intake mix">
        {data.mix.map((m) => (
          <div
            key={m.key}
            className={`mix-seg${m.key === "vendor" ? " vendor" : ""}`}
            style={{ width: `${m.share}%` }}
            title={`${m.label} — ${m.share}%`}
          >
            {m.share >= 12 ? `${m.share}%` : ""}
          </div>
        ))}
      </div>
      <p className="mono-label mix-legend">
        {data.total} applications ·{" "}
        {data.mix.map((m) => `${m.label} ${m.share}%`).join(" · ")}
      </p>

      <div className="table-scroll">
        <table className="channel-table">
          <thead>
            <tr>
              <th>Channel</th>
              <th className="num">Volume</th>
              <th className="num">To interview</th>
              <th className="num">Hires</th>
              <th className="num">Days to hire</th>
              <th className="num">Cost per hire</th>
              <th className="num">90-day retention</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <span className="channel-name">{r.label}</span>
                  <span className={`badge${r.direct ? "" : " warn"}`}>
                    {r.direct ? "direct" : "vendor"}
                  </span>
                </td>
                <td className="num figure-cell">{r.volume}</td>
                <td className="num figure-cell">
                  {r.interview_rate === null ? "—" : `${r.interview_rate}%`}
                </td>
                <td className="num figure-cell">{r.hires}</td>
                <td className="num figure-cell">
                  {r.median_days_to_hire === null ? "—" : r.median_days_to_hire}
                </td>
                <td className="num">
                  <span className="figure-cell">
                    {r.cost_per_hire === null ? "—" : money(r.cost_per_hire)}
                  </span>
                  {r.cost_basis && <span className="basis">{r.cost_basis}</span>}
                </td>
                <td className="num">
                  <span className="figure-cell">
                    {r.retention_90d === null ? "—" : `${r.retention_90d}%`}
                  </span>
                  {r.retention_basis && (
                    <span className="basis">{r.retention_basis}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted channel-note">
        Cost per hire is the contracted fee against the offer amount. A direct
        channel shows €0 because it genuinely pays no placement fee — that is
        the comparison, not a missing value.
      </p>
    </section>
  );
}
