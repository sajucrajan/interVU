"use client";

import { useEffect, useMemo, useState } from "react";
import { hierarchy, partition, type HierarchyRectangularNode } from "d3-hierarchy";
import { arc } from "d3-shape";

export interface SunburstNode {
  name: string;
  kind: string;
  value?: number;
  children?: SunburstNode[];
}

/* Categorical slots 1–3 of the validated reference palette (all-pairs safe);
   deeper rings take lighter steps of the branch hue — magnitude-within-branch,
   not new identities. */
const SLOTS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
};
const SURFACE = { light: "#fcfcfb", dark: "#1a1a19" };

function mix(hex: string, withHex: string, t: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [r1, g1, b1] = h(hex);
  const [r2, g2, b2] = h(withHex);
  const c = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `#${[c(r1!, r2!), c(g1!, g2!), c(b1!, b2!)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return dark;
}

type RNode = HierarchyRectangularNode<SunburstNode>;

export function Sunburst({ data, size = 420 }: { data: SunburstNode; size?: number }) {
  const dark = useDarkMode();
  const [hover, setHover] = useState<RNode | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const { root, maxDepth } = useMemo(() => {
    const h = hierarchy<SunburstNode>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const md = h.height;
    const radius = size / 2;
    partition<SunburstNode>().size([2 * Math.PI, radius])(h);
    return { root: h as RNode, maxDepth: md };
  }, [data, size]);

  const slots = dark ? SLOTS.dark : SLOTS.light;
  const surface = dark ? SURFACE.dark : SURFACE.light;
  const radius = size / 2;
  const ringWidth = radius / (maxDepth + 0.6);

  const colorFor = (node: RNode): string => {
    if (node.depth === 0) return "transparent";
    let top: RNode = node;
    while (top.depth > 1) top = top.parent as RNode;
    const slot = slots[(top.parent!.children as RNode[]).indexOf(top) % slots.length]!;
    // depth 1 = base hue; deeper rings step toward the surface
    return mix(slot, surface, Math.min((node.depth - 1) * 0.32, 0.68));
  };

  const arcGen = arc<RNode>()
    .startAngle((d) => d.x0)
    .endAngle((d) => d.x1)
    .padAngle(0.008)
    .padRadius(radius / 2)
    .innerRadius((d) => Math.max(ringWidth * 0.9, (d.depth - 1) * ringWidth + ringWidth * 0.9))
    .outerRadius((d) => d.depth * ringWidth + ringWidth * 0.82)
    .cornerRadius(3);

  const nodes = root.descendants().filter((d) => d.depth > 0) as RNode[];
  const total = root.value ?? 0;
  const center = hover ?? root;
  const share = total > 0 ? Math.round(((center.value ?? 0) / total) * 100) : 0;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`${-radius} ${-radius} ${size} ${size}`}
        style={{ width: "100%", maxWidth: size, display: "block", margin: "0 auto" }}
        role="img"
        aria-label="Submissions by organization unit, team, and position"
      >
        {nodes.map((d, i) => (
          <path
            key={i}
            d={arcGen(d) ?? undefined}
            fill={colorFor(d)}
            stroke={surface}
            strokeWidth={2}
            opacity={hover && !isAncestorOrSelf(hover, d) && !isAncestorOrSelf(d, hover) ? 0.35 : 1}
            style={{ transition: "opacity 0.15s" }}
            onMouseEnter={() => setHover(d)}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY })}
          />
        ))}
        {nodes
          .filter((d) => d.depth <= 2 && d.x1 - d.x0 > 0.28)
          .map((d, i) => {
            const a = (d.x0 + d.x1) / 2 - Math.PI / 2;
            const r = (d.depth - 0.5) * ringWidth + ringWidth * 0.86;
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;
            return (
              <text
                key={`t${i}`}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: 10.5, fontWeight: 600, pointerEvents: "none" }}
                fill={dark ? "#ffffff" : "#0b0b0b"}
              >
                {d.data.name.length > 14 ? `${d.data.name.slice(0, 13)}…` : d.data.name}
              </text>
            );
          })}
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          y={-10}
          style={{ fontSize: 13, fontWeight: 600 }}
          fill={dark ? "#c3c2b7" : "#52514e"}
        >
          {center.depth === 0 ? "All submissions" : center.data.name}
        </text>
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          y={14}
          style={{ fontSize: 24, fontWeight: 700 }}
          fill={dark ? "#ffffff" : "#0b0b0b"}
        >
          {center.value ?? 0}
        </text>
        {center.depth > 0 && (
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            y={34}
            style={{ fontSize: 11 }}
            fill="#898781"
          >
            {share}% of total
          </text>
        )}
      </svg>
      {hover && tip && (
        <div className="viz-tooltip" style={{ left: tip.x + 14, top: tip.y + 10 }}>
          <strong>{hover.data.name}</strong>{" "}
          <span className="muted">({hover.data.kind})</span>
          <br />
          {hover.value} submission{hover.value === 1 ? "" : "s"} · {share}% of total
        </div>
      )}
    </div>
  );
}

function isAncestorOrSelf(maybeAncestor: RNode, node: RNode): boolean {
  let cur: RNode | null = node;
  while (cur) {
    if (cur === maybeAncestor) return true;
    cur = cur.parent as RNode | null;
  }
  return false;
}
