"use client";

import { useCallback, useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";
import { usePageIdentity } from "@/components/sticky-identity";
import {
  FunnelBars,
  FunnelFilters,
  LossBreakdown,
  SkillTable,
  pct,
  type Funnel,
  type Rates,
} from "@/components/funnel";

/**
 * Vendor performance, for the people who negotiate the contracts.
 *
 * Rendered from the same computation as the agency's own screen, deliberately.
 * Handing an agency a portal that disagrees with your numbers guarantees the
 * quarterly review is spent reconciling two spreadsheets rather than deciding
 * anything — and the agency is right to distrust a number they cannot see the
 * working for.
 *
 * `vendors.manage`, not `positions.view`: this is a commercial screen, not an
 * operational one.
 */

interface VendorRow {
  vendor_org_id: string;
  vendor: string;
  tier: number;
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
}

interface Payload {
  window: string;
  window_label: string;
  options: {
    windows: { key: string; label: string }[];
    positions: { id: string; reference: string; title: string }[];
    skills: string[];
    seniorities: string[];
  };
  vendors: VendorRow[];
}

export default function VendorPerformancePage() {
  const [d, setD] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ window: "91d", position: "", skill: "", seniority: "" });

  const load = useCallback(() => {
    const q = new URLSearchParams({
      window: f.window,
      ...(f.position ? { position: f.position } : {}),
      ...(f.skill ? { skill: f.skill } : {}),
      ...(f.seniority ? { seniority: f.seniority } : {}),
    });
    api<Payload>(`/analytics/vendors?${q}`)
      .then(setD)
      .catch((e) => setError(apiErrorMessage(e)));
  }, [f]);

  useEffect(load, [load]);
  usePageIdentity(d ? { label: "Vendor performance", meta: d.window_label } : null);

  if (error) {
    return (
      <main className="wide">
        <h1>Vendor performance</h1>
        <p className="error">{error}</p>
      </main>
    );
  }
  if (!d) return <main className="wide muted">Loading…</main>;

  const active = d.vendors.filter((v) => v.funnel.submitted > 0);

  return (
    <main className="wide">
      <header className="page-head">
        <div>
          <div className="mono-label">Insight · {d.window_label}</div>
          <h1 style={{ marginTop: 12 }}>Which agencies are worth the fee</h1>
          <p className="dossier-meta">
            Every agency sees these same figures for itself in their portal, from
            the same computation — so a review starts from the numbers rather
            than from whose spreadsheet is right.
          </p>
        </div>
      </header>

      <FunnelFilters
        options={d.options}
        value={f}
        onChange={(next) => setF((p) => ({ ...p, ...next }))}
      />

      {active.length === 0 ? (
        <p className="muted" style={{ marginTop: "var(--step-5)" }}>
          No submissions from any agency in this period. Try a longer window, or
          clear the filters.
        </p>
      ) : (
        <>
          <SectionHead label="Side by side" />
          <div className="hiw-matrix-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Agency</th>
                  <th className="num">Submitted</th>
                  <th className="num">Accepted</th>
                  <th className="num">Interviewed</th>
                  <th className="num">Offered</th>
                  <th className="num">Through to interview</th>
                  <th className="num">End to end</th>
                  <th className="num">Days to interview</th>
                </tr>
              </thead>
              <tbody>
                {active.map((v) => (
                  <tr
                    key={v.vendor_org_id}
                    onClick={() =>
                      setOpen(open === v.vendor_org_id ? null : v.vendor_org_id)
                    }
                    className="vendor-row"
                  >
                    <td>
                      <strong>{v.vendor}</strong>{" "}
                      <span className="badge">tier {v.tier}</span>
                    </td>
                    <td className="num">{v.funnel.submitted}</td>
                    <td className="num">{v.funnel.accepted}</td>
                    <td className="num">{v.funnel.interviewed}</td>
                    <td className="num">{v.funnel.offered}</td>
                    {/* The signal-quality number: of the people they put in
                        front of you, how many were worth an hour. */}
                    <td className="num strong">{pct(v.rates.screen_through)}</td>
                    <td className="num">{pct(v.rates.end_to_end)}</td>
                    <td className="num">
                      {v.median_days_to_interview ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted funnel-note">
            Select an agency for its funnel, its losses and its record by
            technology.
          </p>

          {active
            .filter((v) => v.vendor_org_id === open)
            .map((v) => (
              <div key={v.vendor_org_id} className="vendor-detail">
                <SectionHead label={`${v.vendor} · the funnel`} />
                <FunnelBars funnel={v.funnel} />

                <SectionHead label={`${v.vendor} · where the rest went`} />
                <LossBreakdown funnel={v.funnel} />

                <SectionHead label={`${v.vendor} · by technology`} />
                <p className="muted funnel-note">
                  Where an agency is actually strong. A headline rate averages
                  a specialist and a generalist into the same unhelpful number.
                </p>
                <SkillTable rows={v.by_skill} />
              </div>
            ))}
        </>
      )}
    </main>
  );
}
