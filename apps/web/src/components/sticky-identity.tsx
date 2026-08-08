"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A condensed identity bar that appears once the page header scrolls away.
 *
 * Fixing the real header would have cost 12–17% of the viewport permanently
 * (measured at 107–123px against a 905px window) and pinned a display-sized
 * heading to the top of every scroll — that type size is meant to announce a
 * page once, not shout through it. This carries the two things that actually
 * stop being obvious when you scroll — who you are looking at, and the
 * primary action — in about 48px, and only while they are needed.
 *
 * It does NOT carry navigation: the rail is already sticky, so nothing is
 * unreachable. Adding nav here would duplicate what never left the screen.
 *
 * The sentinel sits between the header and the bar, so "stuck" is detected at
 * exactly the moment the bar begins sticking. CSS has no `:stuck` selector,
 * which is the only reason this needs script at all — and if
 * IntersectionObserver is missing the bar simply stays hidden rather than
 * getting stranded open.
 */
export function StickyIdentity({
  label,
  meta,
  action,
}: {
  label: string;
  meta?: string | null;
  action?: React.ReactNode;
}) {
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setStuck(!entry!.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} className="sticky-sentinel" aria-hidden />
      <div className={`sticky-id${stuck ? " on" : ""}`} aria-hidden={!stuck}>
        <div className="sticky-id-text">
          <strong>{label}</strong>
          {meta && <span className="mono-label">{meta}</span>}
        </div>
        {action && <div className="sticky-id-action">{action}</div>}
      </div>
    </>
  );
}
