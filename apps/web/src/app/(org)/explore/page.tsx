"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ZoomableSunburst, type SunburstNode } from "@/components/zoomable-sunburst";

interface Overview {
  totals: { submissions: number; candidates: number; open_positions: number };
  hierarchy: SunburstNode;
}

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
  const [trail, setTrail] = useState<SunburstNode[]>([]);
  const [focus, setFocus] = useState<SunburstNode | null>(null);

  useEffect(() => {
    api<Overview>("/analytics/overview")
      .then((d) => {
        setData(d);
        setFocus(d.hierarchy);
        setTrail([d.hierarchy]);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  if (!data) return <main className="wide muted">Loading…</main>;

  const current = focus ?? data.hierarchy;
  const counts = descend(current);
  const share =
    data.totals.submissions > 0
      ? Math.round(((sumOf(current) ?? 0) / sumOf(data.hierarchy)!) * 100)
      : 0;

  return (
    <main className="wide">
      <div className="row spread">
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Hierarchy explorer</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Where candidate supply is landing across the organization. Click a
            wedge to zoom in, the centre to zoom back out.
          </p>
        </div>
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
            data={data.hierarchy}
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
              <li>Each ring is a level: organization → vertical → team → position.</li>
              <li>Wedge size is the number of vendor submissions received.</li>
              <li>Colour follows the top-level vertical, lightening with depth.</li>
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
