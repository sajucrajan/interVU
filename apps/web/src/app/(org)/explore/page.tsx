"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ZoomableSunburst, type SunburstNode } from "@/components/zoomable-sunburst";

interface Overview {
  totals: { submissions: number; candidates: number; open_positions: number };
  hierarchy: SunburstNode;
  skill_hierarchy: SunburstNode;
}

type View = "org" | "skill";

function descend(node: SunburstNode): { units: number; positions: number } {
  let units = 0;
  let positions = 0;
  for (const c of node.children ?? []) {
    if (c.kind === "position") positions++;
    else units++;
    const sub = descend(c);
    units += sub.units;
    positions += sub.positions;
  }
  return { units, positions };
}

export default function ExplorePage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [view, setView] = useState<View>("org");
  const [trail, setTrail] = useState<SunburstNode[]>([]);
  const [focus, setFocus] = useState<SunburstNode | null>(null);

  useEffect(() => {
    api<Overview>("/analytics/overview")
      .then((d) => {
        setData(d);
        setFocus(d.hierarchy);
        setTrail([d.hierarchy]);
      })
      .catch(() => undefined);
  }, [router]);

  if (!data) return <main className="wide muted">Loading…</main>;

  const rootFor = (v: View) => (v === "org" ? data.hierarchy : data.skill_hierarchy);
  const root = rootFor(view);
  const current = focus ?? root;
  const counts = descend(current);
  const rootTotal = sumOf(root);
  const share = rootTotal > 0 ? Math.round((sumOf(current) / rootTotal) * 100) : 0;

  function switchView(v: View) {
    setView(v);
    const r = rootFor(v);
    setFocus(r);
    setTrail([r]);
  }

  return (
    <main className="wide">
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Explorer</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            {view === "org"
              ? "Where candidate supply is landing across the organization."
              : "Which technologies your open demand is concentrated in."}{" "}
            Click a wedge to zoom in, the centre to zoom back out.
          </p>
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={view === "org" ? "active" : ""}
          onClick={() => switchView("org")}
        >
          By organization
        </button>
        <button
          type="button"
          className={view === "skill" ? "active" : ""}
          onClick={() => switchView("skill")}
        >
          By technology
        </button>
      </div>

      <nav className="crumbs">
        {trail.map((n, i) => (
          <span key={i}>
            {i > 0 && <span className="crumb-sep">/</span>}
            <span className={i === trail.length - 1 ? "crumb current" : "crumb"}>
              {n.name}
            </span>
          </span>
        ))}
      </nav>

      <div className="explore-layout">
        <section className="card explore-chart">
          <ZoomableSunburst
            key={view}
            data={root}
            size={820}
            onFocusChange={(t, node) => {
              setTrail(t);
              setFocus(node);
            }}
          />
        </section>

        <aside>
          <div className="card">
            <p className="chart-title">{current.name}</p>
            <p className="chart-sub" style={{ textTransform: "capitalize" }}>
              {current.kind === "org" ? "organization" : current.kind}
            </p>
            <div className="tile-grid" style={{ margin: "0.5rem 0 0" }}>
              <div className="tile" style={{ boxShadow: "none" }}>
                <div className="label">Submissions</div>
                <div className="value accent">{sumOf(current)}</div>
              </div>
              <div className="tile" style={{ boxShadow: "none" }}>
                <div className="label">Share of total</div>
                <div className="value">{share}%</div>
              </div>
            </div>
            {(counts.units > 0 || counts.positions > 0) && (
              <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 0 }}>
                Contains {counts.units > 0 && `${counts.units} unit${counts.units === 1 ? "" : "s"}`}
                {counts.units > 0 && counts.positions > 0 && " · "}
                {counts.positions > 0 &&
                  `${counts.positions} position${counts.positions === 1 ? "" : "s"}`}
                .
              </p>
            )}
          </div>

          <div className="card">
            <p className="chart-title">Direct children</p>
            {(current.children ?? []).length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                This is a leaf — a single position.
              </p>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th className="num">Submissions</th>
                  </tr>
                </thead>
                <tbody>
                  {(current.children ?? [])
                    .map((c) => ({ c, v: sumOf(c) }))
                    .sort((a, b) => b.v - a.v)
                    .map(({ c, v }, i) => (
                      <tr key={i}>
                        <td>{c.name}</td>
                        <td className="muted">{c.kind}</td>
                        <td className="num">{v}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <p className="chart-title">How to read this</p>
            <ul className="muted" style={{ fontSize: "0.86rem", paddingLeft: "1.1rem", margin: 0 }}>
              {view === "org" ? (
                <li>
                  Rings are levels: organization → vertical → team → position →
                  candidate.
                </li>
              ) : (
                <>
                  <li>Rings are: technology → position → candidate. ★ marks a must-have.</li>
                  <li>
                    A role needing several technologies appears under each, so branch
                    totals describe demand per technology rather than summing to the
                    submission count.
                  </li>
                </>
              )}
              <li>Wedge size is the number of vendor submissions received.</li>
              <li>Colour follows the top-level branch, lightening with depth.</li>
              <li>Only positions you have access to are included.</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

function sumOf(node: SunburstNode): number {
  if (node.value !== undefined && !node.children?.length) return node.value;
  return (node.children ?? []).reduce((n, c) => n + sumOf(c), 0);
}
