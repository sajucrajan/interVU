"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { findScreen, H, W } from "@/components/mock-screens";

/**
 * Mock screens, browsed like pictures: one at a time, scroll-snapped,
 * arrows and dots, keyboard left/right. One key renders as a figure with a
 * caption and no controls. The frame scales the fixed-size screen to the
 * container, so the same strip works in a sidebar and in a page of prose.
 *
 * `style` carries a theme's tokens as inline custom properties (the
 * Appearance preview); without it the screens take the page's own theme.
 */
export function ScreenStrip({
  keys,
  label = null,
  style,
  mode,
  controls,
  caption,
  ariaLabel,
}: {
  keys: string[];
  label?: string | null;
  style?: CSSProperties;
  mode?: "light" | "dark";
  controls?: ReactNode;
  caption?: ReactNode;
  ariaLabel?: string;
}) {
  const screens = keys.map(findScreen).filter((s) => s !== undefined);
  const stripRef = useRef<HTMLDivElement>(null);
  // Where the strip is heading, so a quick run of clicks counts from the
  // target rather than from wherever the smooth scroll happens to be.
  const target = useRef(0);
  const [scale, setScale] = useState(0.5);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / W));
    ro.observe(el);
    setScale(el.clientWidth / W);
    // A swipe or a scrollbar drag: adopt the frame once the scroll settles.
    let t: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const i = Math.round(el.scrollLeft / el.clientWidth);
        target.current = i;
        setIndex(i);
      }, 120);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      clearTimeout(t);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (screens.length === 0) return null;

  const go = (i: number) => {
    const el = stripRef.current;
    if (!el) return;
    const next = (i + screens.length) % screens.length;
    target.current = next;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    setIndex(next);
  };

  const single = screens.length === 1;
  const frames = (
    <div className="tp-strip" ref={stripRef}>
      {screens.map((s) => (
        <div key={s.key} className="tp-frame" style={{ height: H * scale }}>
          <div className="tp-screen" data-mode={mode} style={{ ...style, width: W, height: H, transform: `scale(${scale})` }}>
            {s.body(label)}
          </div>
        </div>
      ))}
    </div>
  );

  if (single) {
    return (
      <figure className="tp tp-fig" aria-label={ariaLabel ?? screens[0]!.name}>
        {frames}
        <figcaption className="tp-caption">
          <strong>{screens[0]!.name}.</strong> {caption}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure
      className="tp"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(target.current + 1);
        if (e.key === "ArrowLeft") go(target.current - 1);
      }}
      aria-label={ariaLabel ?? "Screens"}
    >
      <div className="tp-bar">
        <div className="tp-title">
          <strong>{screens[index]?.name}</strong>
          <span className="mono-label">
            {index + 1} / {screens.length}
          </span>
        </div>
        <div className="tp-controls">
          {controls}
          <button type="button" className="secondary tp-arrow" aria-label="Previous screen" onClick={() => go(target.current - 1)}>‹</button>
          <button type="button" className="secondary tp-arrow" aria-label="Next screen" onClick={() => go(target.current + 1)}>›</button>
        </div>
      </div>
      {frames}
      <div className="tp-dots">
        {screens.map((s, i) => (
          <button key={s.key} type="button" className={i === index ? "on" : ""} aria-label={s.name} title={s.name} onClick={() => go(i)} />
        ))}
      </div>
      {caption && <figcaption className="tp-caption">{caption}</figcaption>}
    </figure>
  );
}
