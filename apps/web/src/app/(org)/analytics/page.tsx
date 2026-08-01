"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { SunburstNode } from "@/components/zoomable-sunburst";

interface Overview {
  totals: {
    open_positions: number;
    candidates: number;
    submissions: number;
    duplicates_blocked: number;
    interviews: number;
    offers: number;
  };
  funnel: Record<string, number>;
  vendors: {
    vendor: string;
    tier: number;
    submissions: number;
    accepted: number;
    duplicates: number;
    other: number;
  }[];
  hierarchy: SunburstNode;
}

/* Ordinal blue ramp (reference palette): light starts at step 250, dark stops
   at step 600 — both clear the near-surface floor. */
const FUNNEL_LIGHT = ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"];
const FUNNEL_DARK = ["#86b6ef", "#5598e7", "#3987e5", "#256abf", "#184f95"];

const FUNNEL_LABELS: Record<string, string> = {
  submitted: "Submitted",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  hired: "Hired",
};

/* Vendor segments are submission states → status palette + legend + counts. */
const SEG = {
  accepted: { label: "Accepted", color: "var(--ok)" },
  duplicates: { label: "Duplicates blocked", color: "var(--warn)" },
  other: { label: "Other", color: "var(--faint)" },
} as const;

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    api<Overview>("/analytics/overview")
      .then(setData)
      .catch(() => router.push("/login"));
  }, [router]);

  if (!data) return <main className="wide muted">Loading…</main>;

  const t = data.totals;
  const funnelSteps = Object.entries(data.funnel);
  const funnelMax = Math.max(...funnelSteps.map(([, v]) => v), 1);
  const funnelColors = dark ? FUNNEL_DARK : FUNNEL_LIGHT;
  const vendorMax = Math.max(...data.vendors.map((v) => v.submissions), 1);

  return (
    <main className="wide">
      <h1>Analytics</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Hiring activity across your visible verticals, teams, and vendors.
      </p>

      <div className="tile-grid">
        <Tile label="Open positions" value={t.open_positions} />
        <Tile label="Candidates" value={t.candidates} />
        <Tile label="Submissions" value={t.submissions} />
        <Tile label="Duplicates blocked" value={t.duplicates_blocked} accent />
        <Tile label="Interviews" value={t.interviews} />
        <Tile label="Offers" value={t.offers} />
      </div>

      <div className="viz-grid thirds">
        <div className="card">
          <p className="chart-title">Where submissions land</p>
          <p className="chart-sub">
            Organization → vertical → team → position, by submission volume.
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Vertical / team / position</th>
                <th className="num">Submissions</th>
              </tr>
            </thead>
            <tbody>
              <HierarchyRows node={data.hierarchy} depth={0} />
            </tbody>
          </table>
          <p style={{ marginBottom: 0, marginTop: "0.8rem" }}>
            <Link href="/explore">Open the interactive explorer →</Link>
          </p>
        </div>

        <div>
          <div className="card">
            <p className="chart-title">Pipeline funnel</p>
            <p className="chart-sub">Unique candidates reaching each stage.</p>
            {funnelSteps.map(([stage, value], i) => (
              <div className="hbar-row" key={stage}>
                <span className="muted">{FUNNEL_LABELS[stage] ?? stage}</span>
                <div className="hbar-track">
                  <div
                    className="hbar-seg"
                    style={{
                      width: `${(value / funnelMax) * 100}%`,
                      background: funnelColors[i % funnelColors.length],
                    }}
                    title={`${FUNNEL_LABELS[stage] ?? stage}: ${value}`}
                  />
                </div>
                <span className="hbar-val">{value}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <p className="chart-title">Vendor performance</p>
            <p className="chart-sub">Submissions by outcome, per vendor.</p>
            {data.vendors.map((v) => (
              <div className="hbar-row" key={v.vendor}>
                <span className="muted" title={`Tier ${v.tier}`}>
                  {v.vendor}
                </span>
                <div className="hbar-track">
                  {(Object.keys(SEG) as (keyof typeof SEG)[]).map((k) =>
                    v[k] > 0 ? (
                      <div
                        key={k}
                        className="hbar-seg"
                        style={{
                          width: `${(v[k] / vendorMax) * 100}%`,
                          background: SEG[k].color,
                        }}
                        title={`${SEG[k].label}: ${v[k]}`}
                      />
                    ) : null,
                  )}
                </div>
                <span className="hbar-val">{v.submissions}</span>
              </div>
            ))}
            <div className="legend">
              {(Object.keys(SEG) as (keyof typeof SEG)[]).map((k) => (
                <span key={k}>
                  <span className="swatch" style={{ background: SEG[k].color }} />
                  {SEG[k].label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className={`value ${accent ? "accent" : ""}`}>{value}</div>
    </div>
  );
}

function HierarchyRows({ node, depth }: { node: SunburstNode; depth: number }) {
  const value =
    node.value ??
    (node.children ?? []).reduce(function sum(n: number, c: SunburstNode): number {
      return n + (c.value ?? (c.children ?? []).reduce(sum, 0));
    }, 0);
  return (
    <>
      {depth > 0 && (
        <tr>
          <td style={{ paddingLeft: `${depth * 1.2}rem` }}>{node.name}</td>
          <td className="num">{value}</td>
        </tr>
      )}
      {(node.children ?? []).map((c, i) => (
        <HierarchyRows key={i} node={c} depth={depth + 1} />
      ))}
    </>
  );
}
