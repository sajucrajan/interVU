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
 * Rendered ONCE by the org layout rather than added page by page. The first
 * attempt was per-page and it went exactly as that always does: four pages had
 * it, sixteen did not, and there was no way to predict which — an affordance
 * you cannot rely on is worse than one you do not have, because you stop
 * looking for it. Living in the layout means a new page gets it for free and
 * no page can be forgotten.
 *
 * Fixing the real header instead would have cost 12–17% of the viewport
 * permanently (measured at 107–123px against a 905px window) and pinned a
 * display-sized heading to the top of every scroll. This carries the two
 * things that stop being obvious — where you are, and what the action is — in
 * about 44px, and only while you are scrolled away from them.
 *
 * It carries no navigation: the rail is already sticky, so repeating it would
 * cost space for nothing.
 */

interface Identity {
  label: string;
  meta?: string | null;
  action?: React.ReactNode;
}

const IdentityContext = createContext<{
  set: (id: Identity | null) => void;
} | null>(null);

/**
 * Fallback labels, so a page that says nothing still gets a correct bar.
 * Longest-prefix wins, which lets `/positions/[id]` fall back to "Positions"
 * until the page supplies the actual role title.
 */
const ROUTE_LABELS: [string, string][] = [
  ["/dashboard", "Today"],
  ["/pipeline", "Pipeline"],
  ["/match-reviews", "Match reviews"],
  ["/interviews", "My interviews"],
  ["/questions", "Question bank"],
  ["/positions/new", "New position"],
  ["/positions", "Positions"],
  ["/templates/new", "New template"],
  ["/templates", "Job description templates"],
  ["/analytics", "Analytics"],
  ["/explore", "Explorer"],
  ["/candidates", "Candidate"],
  ["/applications", "Application"],
  ["/admin/people", "People & access"],
  ["/admin/roles", "Roles"],
  ["/admin/teams", "Teams"],
  ["/admin/vendors", "Vendors"],
];

function labelForRoute(pathname: string): string {
  let best = "";
  for (const [prefix, label] of ROUTE_LABELS) {
    if (pathname.startsWith(prefix) && prefix.length > best.length) best = label;
  }
  return best || "InterVU";
}

/**
 * Give the bar a richer identity than the route can supply — a candidate's
 * name, a role title, a count that is the reason you opened the page.
 * Cleared on unmount so a stale name cannot follow you to the next screen.
 */
export function usePageIdentity(identity: Identity | null) {
  const ctx = useContext(IdentityContext);
  const set = ctx?.set;
  const key = JSON.stringify({
    label: identity?.label,
    meta: identity?.meta,
  });
  useEffect(() => {
    if (!set) return;
    set(identity);
    return () => set(null);
    // Keyed on the VALUES, not the object: an inline object literal is a new
    // reference every render and would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set, key]);
}

export function PageIdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [stuck, setStuck] = useState(false);
  const pathname = usePathname();
  const sentinel = useRef<HTMLDivElement>(null);
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

  return (
    <IdentityContext.Provider value={value}>
      {/* The host wraps the PAGE, not just the bar. A sticky element can only
          stick within its own parent's box, so a host that contained the bar
          alone gave it nothing to stick to and it scrolled away with the
          content. */}
      <div className="sticky-host">
        <div ref={sentinel} className="sticky-sentinel" aria-hidden />
        <StickyBar identity={identity} pathname={pathname} stuck={stuck} />
        {children}
      </div>
    </IdentityContext.Provider>
  );
}

function StickyBar({
  identity,
  pathname,
  stuck,
}: {
  identity: Identity | null;
  pathname: string;
  stuck: boolean;
}) {
  const label = identity?.label ?? labelForRoute(pathname);

  return (
    <>
      <div className={`sticky-id${stuck ? " on" : ""}`} aria-hidden={!stuck}>
        <div className="sticky-id-text">
          <strong>{label}</strong>
          {identity?.meta && <span className="mono-label">{identity.meta}</span>}
        </div>
        {identity?.action && (
          <div className="sticky-id-action">{identity.action}</div>
        )}
      </div>
    </>
  );
}
