"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import type { Worklist } from "@/lib/worklist";
import { switchPersona } from "@/components/persona-switch";

/**
 * `needs` is the permission that makes a destination useful; links a user
 * cannot act on are hidden rather than rendering an empty or 403 page.
 * `queue` matches a worklist group key, so its count renders on the item.
 */
interface RailLink {
  group: string;
  href: string;
  label: string;
  icon: string;
  /** Shown when the user holds this permission, or any one of these. */
  needs?: string | string[];
  /** Only for people who interview: scorecards.submit, or any panel seat. */
  panelOnly?: boolean;
  queue?: string[];
}

const LINKS: RailLink[] = [
  { group: "Work", href: "/dashboard", label: "Today", icon: "◱" },
  {
    group: "Work",
    href: "/pipeline",
    label: "Pipeline",
    icon: "▤",
    needs: "submissions.view",
    queue: ["unscreened", "decisions", "duplicates"],
  },
  {
    group: "Work",
    href: "/match-reviews",
    label: "Match reviews",
    icon: "⌗",
    needs: "candidates.merge",
    queue: ["match_reviews"],
  },
  {
    group: "Work",
    href: "/interviews",
    label: "My interviews",
    icon: "◷",
    // Shown to people who interview, by permission or by sitting on a panel.
    // A project manager who is never on one saw a permanently empty page.
    panelOnly: true,
    queue: ["scorecards"],
  },
  {
    // No `needs`: interviewers hold no hiring permissions at all, and they
    // are exactly who the bank depends on for contributions.
    group: "Hiring",
    href: "/questions",
    label: "Question bank",
    icon: "⁇",
  },
  {
    group: "Hiring",
    href: "/positions",
    label: "Positions",
    icon: "◈",
    needs: "positions.view",
  },
  {
    group: "Hiring",
    href: "/templates",
    label: "Templates",
    icon: "❏",
    needs: "positions.view",
  },
  {
    group: "Insight",
    href: "/analytics",
    label: "Analytics",
    icon: "◧",
    needs: "positions.view",
  },
  {
    group: "Insight",
    href: "/analytics/vendors",
    label: "Vendor performance",
    icon: "⚖",
    // Commercial, not operational — this is the screen a fee is renegotiated
    // from, so it follows the vendor permissions rather than positions.view.
    needs: ["vendors.manage", "vendors.view_performance"],
  },
  {
    group: "Insight",
    href: "/explore",
    label: "Explorer",
    icon: "◎",
    needs: "positions.view",
  },
  {
    group: "Admin",
    href: "/admin/people",
    label: "People & access",
    icon: "⚭",
    needs: "org.manage_users",
  },
  {
    group: "Admin",
    href: "/admin/vendors",
    label: "Vendors",
    icon: "⚯",
    needs: "vendors.manage",
  },
];

interface OrgMe {
  kind: string;
  name?: string;
  capabilities?: string[];
  organization?: { name: string; branding?: { accent?: string; product_label?: string } };
  persona?: { key: string; label: string } | null;
  personas?: { key: string; label: string; scope: string; pending: number }[];
  persona_preference?: { default_persona: string | null; ask_at_login: boolean };
}

/** Relative luminance → readable text colour on an arbitrary brand accent. */
function inkFor(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * srgb[0]! + 0.7152 * srgb[1]! + 0.0722 * srgb[2]!;
  return L > 0.45 ? "#14130f" : "#ffffff";
}

function washFor(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.1)`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

export function OrgRail() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<OrgMe | null>(null);
  const [caps, setCaps] = useState<string[] | null>(null);
  const [wl, setWl] = useState<Worklist | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Narrow viewports collapse the rail to a bar; the nav becomes a drawer.
  // Desktop ignores this entirely — the media query never shows the toggle.
  const [navOpen, setNavOpen] = useState(false);
  const footRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<OrgMe>("/auth/me")
      .then((m) => {
        if (m.kind !== "org") return;
        // Signed in, but which job? The picker, with a way back here.
        if (m.persona === null && (m.personas?.length ?? 0) > 1) {
          const here = window.location.pathname + window.location.search;
          window.location.replace(`/choose-persona?next=${encodeURIComponent(here)}`);
          return;
        }
        setMe(m);
        setCaps(m.capabilities ?? []);
        // White-labelling: the org may override the accent, so both derived
        // values are recomputed rather than left at the light-theme defaults.
        const accent = m.organization?.branding?.accent;
        if (accent) {
          const root = document.documentElement.style;
          root.setProperty("--accent", accent);
          const ink = inkFor(accent);
          const wash = washFor(accent);
          if (ink) root.setProperty("--accent-ink", ink);
          if (wash) root.setProperty("--accent-wash", wash);
        }
      })
      .catch(() => undefined);
  }, []);

  const refresh = useCallback(() => {
    api<Worklist>("/me/worklist")
      .then(setWl)
      .catch(() => undefined);
  }, []);

  // Refresh on navigation and on a slow poll, so counts reflect work that
  // arrives while the tab sits open.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, [refresh, pathname]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (footRef.current && !footRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const visible = LINKS.filter((l) => {
    if (l.panelOnly && caps && wl && !caps.includes("scorecards.submit") && !wl.on_panels) {
      return false;
    }
    // Gated links wait for capabilities. Showing them while /auth/me was
    // loading — or after it failed — offered every role the admin pages.
    if (!l.needs) return true;
    if (!caps) return false;
    return Array.isArray(l.needs)
      ? l.needs.some((n) => caps.includes(n))
      : caps.includes(l.needs);
  });
  const groups = [...new Set(visible.map((l) => l.group))];

  /** A badge you must open to understand is a badge that gets ignored, so the
   *  worklist counts render on the nav item itself rather than behind a bell. */
  const countFor = (link: RailLink) => {
    if (!link.queue || !wl) return null;
    const matched = wl.groups.filter((g) => link.queue!.includes(g.key));
    if (matched.length === 0) return null;
    const total = matched.reduce((n, g) => n + g.count, 0);
    if (total === 0) return null;
    return { total, critical: matched.some((g) => g.tone === "critical") };
  };

  const pending = wl
    ? wl.groups.reduce((n, g) => n + g.count, 0)
    : 0;

  const org = me?.organization;
  // The rail states who you are as well as where you are (design 1b). With
  // personas, "who" is the job being done, not the sum of every grant.
  const role = me?.persona?.label ?? wl?.user.roles[0];
  const others = wl?.other_personas ?? [];
  const elsewhere = others.reduce((n, p) => n + p.pending, 0);
  const pref = me?.persona_preference;
  const isDefault = !!me?.persona && pref?.default_persona === me.persona.key;

  const setPreference = (body: { default_persona?: string | null; ask_at_login?: boolean }) =>
    api<OrgMe["persona_preference"]>("/auth/persona-preference", { method: "PATCH", body })
      .then((p) => setMe((m) => (m ? { ...m, persona_preference: p } : m)))
      .catch(() => undefined);

  // The most specific link wins. A plain prefix test lit up both Analytics and
  // Vendor performance on /analytics/vendors, because one path starts the other.
  const activeHref = visible
    .filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))
    .reduce<string | null>(
      (best, l) => (best && best.length >= l.href.length ? best : l.href),
      null,
    );

  return (
    <>
      <CommandPalette capabilities={caps ?? []} />
      <aside className={`rail${navOpen ? " open" : ""}`}>
      <div className="rail-head">
        <div className="rail-brand">
          <Link href="/dashboard" className="brand">
            Inter<span className="brand-accent">/</span>VU
          </Link>
          {/* Organization and role on their own lines. Joined, a long role
              name ("Organization admin") wrapped mid-phrase. */}
          {org && (
            <div className="mono-label rail-org" style={{ marginTop: 8 }}>
              {org.branding?.product_label ?? org.name}
            </div>
          )}
          {org && role && <div className="mono-label rail-role">{role}</div>}
        </div>
        {/* Mobile only. The count rides on the toggle so collapsing the nav
            never hides the fact that work is waiting. */}
        <button
          type="button"
          className="rail-toggle"
          aria-expanded={navOpen}
          aria-controls="rail-nav"
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setNavOpen((v) => !v)}
        >
          <span aria-hidden>{navOpen ? "✕" : "☰"}</span>
          {!navOpen && pending > 0 && (
            <span className="rail-count critical">
              {pending > 99 ? "99+" : pending}
            </span>
          )}
        </button>
      </div>

      <nav className="rail-nav" id="rail-nav">
        {groups.map((group) => (
          <div key={group}>
            <div className="rail-group mono-label">{group}</div>
            {visible
              .filter((l) => l.group === group)
              .map((l) => {
                const count = countFor(l);
                const active = l.href === activeHref;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`rail-item${active ? " active" : ""}`}
                  >
                    <span className="rail-icon" aria-hidden>
                      {l.icon}
                    </span>
                    <span className="rail-label">{l.label}</span>
                    {count && (
                      <span
                        className={`rail-count${count.critical ? " critical" : ""}`}
                      >
                        {count.total > 99 ? "99+" : count.total}
                      </span>
                    )}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="rail-foot" ref={footRef}>
        <span className="rail-avatar" aria-hidden>
          {initials(me?.name ?? "?")}
        </span>
        <span className="rail-user">{me?.name ?? ""}</span>
        <ThemeToggle />
        <button
          type="button"
          className="rail-more"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Account menu"
        >
          ⋯
          {/* Work waiting in another persona rides on the menu button, so
              the hiring manager never forgets the scorecard they owe. */}
          {elsewhere > 0 && <span className="rail-count critical rail-elsewhere">{elsewhere}</span>}
        </button>
        {menuOpen && (
          <div className="rail-menu">
            {me?.persona && (me.personas?.length ?? 0) > 1 && (
              <>
                <div className="rail-menu-head mono-label">
                  Acting as {me.persona.label}
                </div>
                {others.map((p) => (
                  <button key={p.key} type="button" onClick={() => switchPersona(p.key)}>
                    Switch to {p.label}
                    {p.pending > 0 && (
                      <span className="badge warn rail-menu-count">{p.pending} waiting</span>
                    )}
                  </button>
                ))}
                <div className="rail-menu-sep" />
                {pref?.ask_at_login ? (
                  <button type="button" onClick={() => setPreference({ ask_at_login: false, default_persona: me.persona!.key })}>
                    Stop asking; open as {me.persona.label}
                  </button>
                ) : (
                  <>
                    {!isDefault && (
                      <button type="button" onClick={() => setPreference({ default_persona: me.persona!.key })}>
                        Open as {me.persona.label} next time
                      </button>
                    )}
                    <button type="button" onClick={() => setPreference({ ask_at_login: true })}>
                      Ask me which persona at sign-in
                    </button>
                  </>
                )}
                <div className="rail-menu-sep" />
              </>
            )}
            <button
              type="button"
              onClick={() =>
                api("/auth/logout", { method: "POST" }).then(() => router.push("/login"))
              }
            >
              Sign out
            </button>
          </div>
        )}
      </div>
      </aside>
    </>
  );
}
