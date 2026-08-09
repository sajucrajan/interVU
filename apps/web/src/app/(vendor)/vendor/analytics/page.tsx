"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";
import {
  FunnelBars,
  FunnelFilters,
  LossBreakdown,
  RateTile,
  SkillTable,
  pct,
  type Funnel,
  type Rates,
} from "@/components/funnel";

/**
 * What happened to the candidates we sent.
 *
 * The agency side of the same numbers the client sees, rendered from the same
 * API computation. That is the design: a vendor review where the two parties
 * disagree about how many candidates were even submitted spends its hour
 * reconciling spreadsheets instead of deciding anything.
 *
 * The benchmark is pooled across the other agencies and suppressed below
 * three of them — with two, "the others' average" is one subtraction away
 * from a named competitor's conversion rate.
 */

interface Payload {
  window: string;
  window_label: string;
  options: {
    windows: { key: string; label: string }[];
    positions: { id: string; reference: string; title: string }[];
    skills: string[];
    seniorities: string[];
  };
  mine: {
    funnel: Funnel;
    rates: Rates;
    previous: { rates: Rates } | null;
    median_days_to_interview: number | null;
    by_skill: {
      skill: string;
      submitted: number;
      interviewed: number;
      offered: number;
      screen_through: number | null;
    }[];
  } | null;
  benchmark:
    | { available: true; peer_count: number; rates: Rates }
    | { available: false; peer_count: number; reason: string };
}

export default function VendorAnalyticsPage() {
  const [d, setD] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ window: "91d", position: "", skill: "", seniority: "" });

  const load = useCallback(() => {
    const q = new URLSearchParams({
      window: f.window,
      ...(f.position ? { position: f.position } : {}),
      ...(f.skill ? { skill: f.skill } : {}),
      ...(f.seniority ? { seniority: f.seniority } : {}),
    });
    api<Payload>(`/vendor/analytics?${q}`)
      .then(setD)
      .catch((e) => setError(apiErrorMessage(e)));
  }, [f]);

  useEffect(load, [load]);

  if (error) {
    return (
      <main className="wide">
        <h1>Performance</h1>
        <p className="error">{error}</p>
      </main>
    );
  }
  if (!d) return <main className="wide muted">Loading…</main>;

  const m = d.mine;
  const delta = (now: number | null, before: number | null | undefined) =>
    now == null || before == null ? null : now - before;

  return (
    <main className="wide">
      <header className="page-head">
        <div>
          <div className="mono-label">Your performance · {d.window_label}</div>
          <h1 style={{ marginTop: 12 }}>What happened to the people you sent</h1>
        </div>
      </header>

      <FunnelFilters
        options={d.options}
        value={f}
        onChange={(next) => setF((p) => ({ ...p, ...next }))}
      />

      {!m || m.funnel.submitted === 0 ? (
        <p className="muted" style={{ marginTop: "var(--step-5)" }}>
          No submissions in this period. Try a longer window, or clear the
          filters.
        </p>
      ) : (
        <>
          <div className="rate-row">
            <RateTile
              label="Accepted"
              value={m.rates.accept}
              num={m.funnel.accepted}
              den={m.funnel.submitted}
              delta={delta(m.rates.accept, m.previous?.rates.accept)}
              hint="Survived the duplicate check — nobody had already sent them."
            />
            <RateTile
              label="Through to interview"
              value={m.rates.screen_through}
              num={m.funnel.interviewed}
              den={m.funnel.accepted}
              delta={delta(m.rates.screen_through, m.previous?.rates.screen_through)}
              hint="Of the people you introduced, how many were worth an hour. The number worth arguing about."
            />
            <RateTile
              label="Offered after interview"
              value={m.rates.offer}
              num={m.funnel.offered}
              den={m.funnel.interviewed}
              delta={delta(m.rates.offer, m.previous?.rates.offer)}
              hint="Did the panel agree with the screener."
            />
            <RateTile
              label="End to end"
              value={m.rates.end_to_end}
              num={m.funnel.offered}
              den={m.funnel.submitted}
              delta={delta(m.rates.end_to_end, m.previous?.rates.end_to_end)}
              hint="Submissions that became an offer."
            />
          </div>

          <SectionHead label="The funnel" />
          <FunnelBars funnel={m.funnel} />
          {m.median_days_to_interview != null && (
            <p className="muted funnel-note">
              Median {m.median_days_to_interview} days from your submission to a
              first interview.
            </p>
          )}

          <SectionHead label="Where the rest went" />
          <LossBreakdown funnel={m.funnel} />

          <SectionHead label="By technology" />
          <p className="muted funnel-note">
            Your headline rate is an average across every role. This is where it
            comes from — and usually where the useful conversation is.
          </p>
          <SkillTable rows={m.by_skill} />

          <SectionHead label="Against the other agencies" />
          {d.benchmark.available ? (
            <table className="data">
              <thead>
                <tr>
                  <th>Rate</th>
                  <th className="num">You</th>
                  <th className="num">
                    Everyone else ({d.benchmark.peer_count} agencies)
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Accepted", "accept"],
                    ["Through to interview", "screen_through"],
                    ["Offered after interview", "offer"],
                    ["End to end", "end_to_end"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="num">{pct(m.rates[key])}</td>
                    <td className="num muted">
                      {pct(d.benchmark.available ? d.benchmark.rates[key] : null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Saying why beats an empty panel: the reader learns the
               comparison exists and what would make it appear, instead of
               assuming the feature is broken. */
            <p className="muted bench-suppressed">{d.benchmark.reason}</p>
          )}
          <p className="muted funnel-note">
            Pooled totals across the other agencies, never named and never
            individually identifiable.
          </p>
        </>
      )}
    </main>
  );
}
