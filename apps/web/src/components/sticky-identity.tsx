"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

/**
 * The condensed identity bar that appears once you scroll.
 *
 * It reads the page's own `<h1>`. That is the whole idea: this bar IS the
 * header, condensed, so it should say what the header says. A route→label
 * table was the first attempt and it was wrong twice over — it showed the
 * RAIL's name for a page ("Analytics") rather than the page's actual heading
 * ("Hiring performance"), and it would have drifted the moment anyone edited
 * a heading without remembering the table existed.
 *
 * Reading the DOM also means a new page needs no wiring at all. Pages only
 * speak up when they have something the heading cannot carry — a reference
 * code, a count, an action — through `usePageIdentity`.
 *
 * Rendered once by the org layout. Added page by page it reached 4 screens out
 * of 20, and an affordance you cannot predict is worse than one you do not
 * have.
 *
 * Fixing the real header instead would have cost 12–17% of the viewport
 * permanently (measured at 107–123px against a 905px window) and pinned a
 * display-sized heading to the top of every scroll. This costs about 44px, and
 * only while you are scrolled away from the thing it stands in for.
 */

interface Identity {
  /** Overrides the h1 — use when the heading alone is not the identity. */
  label?: string;
  meta?: string | null;
  action?: React.ReactNode;
}

const IdentityContext = createContext<{
  set: (id: Identity | null) => void;
} | null>(null);

/**
 * Add what the heading cannot carry: a reference code, an outstanding count,
 * a primary action. Cleared on unmount so nothing follows you to the next
 * screen.
 */
export function usePageIdentity(identity: Identity | null) {
  const ctx = useContext(IdentityContext);
  const set = ctx?.set;
  const key = JSON.stringify({ label: identity?.label, meta: identity?.meta });
  useEffect(() => {
    if (!set) return;
    set(identity);
    return () => set(null);
    // Keyed on the VALUES: an inline object is a new reference every render
    // and would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, key]);
}

/** Headings wrap across lines and carry decorative spans; the bar wants one line. */
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export function PageIdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [heading, setHeading] = useState("");
  const [stuck, setStuck] = useState(false);
  const pathname = usePathname();
  const sentinel = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const value = useMemo(() => ({ set: setIdentity }), []);

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

  // Most pages render their heading only after data arrives, so a single read
  // on mount would catch "Loading…" and keep it. Watching the subtree means
  // the bar is right whenever the heading settles, including after a filter
  // changes it.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const read = () => {
      const h1 = el.querySelector("h1");
      setHeading(h1 ? oneLine(h1.textContent ?? "") : "");
    };
    read();
    if (typeof MutationObserver === "undefined") return;
    const mo = new MutationObserver(read);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [pathname]);

  const label = identity?.label ?? heading;

  return (
    <IdentityContext.Provider value={value}>
      {/* The host wraps the PAGE: a sticky element can only stick within its
          own parent's box, so a host containing just the bar gave it nothing
          to stick to and it scrolled away with the content. */}
      <div className="sticky-host" ref={host}>
        <div ref={sentinel} className="sticky-sentinel" aria-hidden />
        <div
          className={`sticky-id${stuck && label ? " on" : ""}`}
          aria-hidden={!stuck}
        >
          <div className="sticky-id-text">
            <strong>{label}</strong>
            {identity?.meta && (
              <span className="mono-label">{identity.meta}</span>
            )}
          </div>
          {identity?.action && (
            <div className="sticky-id-action">{identity.action}</div>
          )}
        </div>
        {children}
      </div>
    </IdentityContext.Provider>
  );
}
