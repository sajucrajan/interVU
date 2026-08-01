"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hierarchy, partition, type HierarchyRectangularNode } from "d3-hierarchy";
import { arc } from "d3-shape";
import { interpolate } from "d3-interpolate";

export interface SunburstNode {
  name: string;
  kind: string;
  value?: number;
  children?: SunburstNode[];
}

/** Categorical slots 1–3 of the validated palette (all-pairs CVD-safe). */
const SLOTS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a"],
  dark: ["#3987e5", "#d95926", "#199e70"],
};
const SURFACE = { light: "#fcfcfb", dark: "#1a1a19" };
const DURATION = 750;

type RNode = HierarchyRectangularNode<SunburstNode> & {
  current: Coords;
  target: Coords;
  slotIndex: number;
};
interface Coords {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function mix(hex: string, withHex: string, t: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [r1, g1, b1] = h(hex);
  const [r2, g2, b2] = h(withHex);
  const c = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `#${[c(r1!, r2!), c(g1!, g2!), c(b1!, b2!)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Follows the in-app theme toggle (html[data-theme]), not the OS preference. */
function useDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.dataset.theme === "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/**
 * Zoomable sunburst (after the classic D3 pattern): click a wedge to zoom into
 * that branch, click the centre to zoom back out. Angles and radii are
 * interpolated on every frame, so navigating the hierarchy stays legible.
 */
export function ZoomableSunburst({
  data,
  size = 760,
  onFocusChange,
}: {
  data: SunburstNode;
  size?: number;
  onFocusChange?: (trail: SunburstNode[], node: SunburstNode) => void;
}) {
  const dark = useDark();
  const radius = size / 6; // ring thickness; total radius = size/2
  const [, forceRender] = useState(0);
  const [hover, setHover] = useState<RNode | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const focusRef = useRef<RNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const root = useMemo(() => {
    const h = hierarchy<SunburstNode>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const r = partition<SunburstNode>().size([2 * Math.PI, h.height + 1])(h) as RNode;
    r.each((d) => {
      const n = d as RNode;
      n.current = { x0: n.x0, x1: n.x1, y0: n.y0, y1: n.y1 };
      n.target = { ...n.current };
      // Colour follows the depth-1 ancestor, so a branch keeps its hue.
      let top: RNode = n;
      while (top.depth > 1 && top.parent) top = top.parent as RNode;
      n.slotIndex = top.parent
        ? (top.parent.children as RNode[]).indexOf(top)
        : 0;
    });
    focusRef.current = r;
    return r;
  }, [data]);

  const arcGen = useMemo(
    () =>
      arc<Coords>()
        .startAngle((d) => d.x0)
        .endAngle((d) => d.x1)
        .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(radius * 1.5)
        .innerRadius((d) => d.y0 * radius)
        .outerRadius((d) => Math.max(d.y0 * radius, d.y1 * radius - 1)),
    [radius],
  );

  function zoomTo(p: RNode) {
    focusRef.current = p;
    const nodes: RNode[] = root.descendants() as RNode[];
    for (const d of nodes) {
      d.target = {
        x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
        y0: Math.max(0, d.y0 - p.depth),
        y1: Math.max(0, d.y1 - p.depth),
      };
    }
    const from = nodes.map((d) => ({ ...d.current }));
    const start = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      nodes.forEach((d, i) => {
        d.current = interpolate(from[i]!, d.target)(eased) as Coords;
      });
      forceRender((v) => v + 1);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    if (onFocusChange) {
      const trail = p.ancestors().reverse().map((n) => n.data);
      onFocusChange(trail, p.data);
    }
  }

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const slots = dark ? SLOTS.dark : SLOTS.light;
  const surface = dark ? SURFACE.dark : SURFACE.light;
  const nodes = root.descendants().slice(1) as RNode[];
  const focus = focusRef.current ?? root;

  const colorFor = (d: RNode) =>
    mix(slots[d.slotIndex % slots.length]!, surface, Math.min((d.depth - 1) * 0.28, 0.62));
  const visible = (c: Coords) => c.y1 <= 3 && c.y0 >= 1 && c.x1 > c.x0;
  const labelVisible = (c: Coords) =>
    c.y1 <= 3 && c.y0 >= 1 && (c.y1 - c.y0) * (c.x1 - c.x0) > 0.03;
  const labelTransform = (c: Coords) => {
    const x = (((c.x0 + c.x1) / 2) * 180) / Math.PI;
    const y = ((c.y0 + c.y1) / 2) * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        style={{ width: "100%", height: "auto", maxHeight: "72vh", display: "block" }}
        role="img"
        aria-label="Zoomable hierarchy of submissions by unit, team and position"
      >
        <g>
          {nodes.map((d, i) => (
            <path
              key={i}
              d={arcGen(d.current) ?? undefined}
              fill={colorFor(d)}
              fillOpacity={visible(d.current) ? (hover === d ? 1 : 0.86) : 0}
              stroke={surface}
              strokeWidth={1.5}
              style={{ cursor: d.children ? "pointer" : "default" }}
              pointerEvents={visible(d.current) ? "auto" : "none"}
              onClick={() => d.children && zoomTo(d)}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY })}
            />
          ))}
        </g>
        <g pointerEvents="none" textAnchor="middle" style={{ userSelect: "none" }}>
          {nodes.map((d, i) =>
            labelVisible(d.current) ? (
              <text
                key={i}
                transform={labelTransform(d.current)}
                dy="0.35em"
                fill={dark ? "#ffffff" : "#0b0b0b"}
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {d.data.name.length > 18 ? `${d.data.name.slice(0, 17)}…` : d.data.name}
              </text>
            ) : null,
          )}
        </g>
        {/* Centre disc: click to zoom out one level */}
        <circle
          r={radius}
          fill="none"
          pointerEvents="all"
          style={{ cursor: focus.parent ? "pointer" : "default" }}
          onClick={() => focus.parent && zoomTo(focus.parent as RNode)}
        />
        <text
          textAnchor="middle"
          dy="-0.4em"
          fill={dark ? "#c3c2b7" : "#52514e"}
          style={{ fontSize: 13, fontWeight: 600, pointerEvents: "none" }}
        >
          {focus.data.name.length > 22
            ? `${focus.data.name.slice(0, 21)}…`
            : focus.data.name}
        </text>
        <text
          textAnchor="middle"
          dy="0.9em"
          fill={dark ? "#ffffff" : "#0b0b0b"}
          style={{ fontSize: 26, fontWeight: 700, pointerEvents: "none" }}
        >
          {focus.value ?? 0}
        </text>
        {focus.parent && (
          <text
            textAnchor="middle"
            dy="2.6em"
            fill="#898781"
            style={{ fontSize: 10.5, pointerEvents: "none" }}
          >
            click centre to go up
          </text>
        )}
      </svg>
      {hover && tip && visible(hover.current) && (
        <div className="viz-tooltip" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          <strong>{hover.data.name}</strong>{" "}
          <span className="muted">({hover.data.kind})</span>
          <br />
          {hover.value} submission{hover.value === 1 ? "" : "s"}
          {hover.children ? " · click to zoom in" : ""}
        </div>
      )}
    </div>
  );
}
