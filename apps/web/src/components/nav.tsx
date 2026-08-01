"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Worklist } from "@/lib/worklist";

/** `needs` is the permission that makes a destination useful; links a user
 *  cannot act on are hidden rather than rendering an empty or 403 page. */
const LINKS: { href: string; label: string; needs?: string }[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/pipeline", label: "Pipeline", needs: "submissions.view" },
  { href: "/positions", label: "Positions", needs: "positions.view" },
  { href: "/templates", label: "Templates", needs: "positions.view" },
  { href: "/analytics", label: "Analytics", needs: "positions.view" },
  { href: "/explore", label: "Explore", needs: "positions.view" },
  { href: "/interviews", label: "My interviews" },
];

interface OrgMe {
  kind: string;
  name?: string;
  capabilities?: string[];
  organization?: { name: string; branding?: { accent?: string; product_label?: string } };
}

export function OrgNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [org, setOrg] = useState<OrgMe["organization"] | null>(null);
  const [caps, setCaps] = useState<string[] | null>(null);
  const [wl, setWl] = useState<Worklist | null>(null);
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<OrgMe>("/auth/me")
      .then((me) => {
        if (me.kind !== "org" || !me.organization) return;
        setOrg(me.organization);
        setCaps(me.capabilities ?? []);
        const accent = me.organization.branding?.accent;
        if (accent) document.documentElement.style.setProperty("--accent", accent);
      })
      .catch(() => undefined);
  }, []);

  const refresh = useCallback(() => {
    api<Worklist>("/me/worklist")
      .then(setWl)
      .catch(() => undefined);
  }, []);

  // Refresh on navigation and on a slow poll, so the badge reflects work that
  // arrives while the tab sits open.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh, pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const count = wl?.total ?? 0;

  return (
    <nav className="topnav">
      <Link href="/dashboard" className="brand">
        Inter<span className="brand-accent">VU</span>
      </Link>
      {org && <span className="org-chip">{org.branding?.product_label ?? org.name}</span>}
      <div className="topnav-links">
        {LINKS.filter((l) => !l.needs || !caps || caps.includes(l.needs)).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname.startsWith(l.href) ? "active" : ""}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className="nav-right" ref={bellRef}>
        <button
          type="button"
          className="bell"
          aria-label={`${count} item${count === 1 ? "" : "s"} need attention`}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden>🔔</span>
          {count > 0 && <span className="bell-badge">{count > 99 ? "99+" : count}</span>}
        </button>
        {open && (
          <div className="bell-menu">
            <div className="bell-menu-head">
              {count > 0 ? `${count} pending item${count === 1 ? "" : "s"}` : "Nothing pending"}
            </div>
            {wl?.groups.length ? (
              wl.groups.map((g) => (
                <Link
                  key={g.key}
                  href={g.href}
                  className="bell-item"
                  onClick={() => setOpen(false)}
                >
                  <span className={`bell-dot tone-${g.tone}`} />
                  <span className="bell-item-label">{g.label}</span>
                  <span className="bell-item-count">{g.count}</span>
                </Link>
              ))
            ) : (
              <p className="muted bell-empty">You&apos;re all caught up.</p>
            )}
          </div>
        )}
        <button
          className="secondary"
          onClick={() =>
            api("/auth/logout", { method: "POST" }).then(() => router.push("/login"))
          }
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
