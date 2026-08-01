"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandPalette } from "@/components/command-palette";
import type { Worklist } from "@/lib/worklist";

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
  needs?: string;
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
    queue: ["scorecards"],
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
  const footRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<OrgMe>("/auth/me")
      .then((m) => {
        if (m.kind !== "org") return;
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

  const visible = LINKS.filter((l) => !l.needs || !caps || caps.includes(l.needs));
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

  const org = me?.organization;
  // The rail states who you are as well as where you are (design 1b).
  const role = wl?.user.roles[0];

  return (
    <>
      <CommandPalette capabilities={caps ?? []} />
      <aside className="rail">
      <div className="rail-head">
        <Link href="/dashboard" className="brand">
          Inter<span className="brand-accent">/</span>VU
        </Link>
        {org && (
          <div className="mono-label" style={{ marginTop: 8 }}>
            {org.branding?.product_label ?? org.name}
            {role && ` · ${role}`}
          </div>
        )}
      </div>

      <nav className="rail-nav">
        {groups.map((group) => (
          <div key={group}>
            <div className="rail-group mono-label">{group}</div>
            {visible
              .filter((l) => l.group === group)
              .map((l) => {
                const count = countFor(l);
                const active = pathname.startsWith(l.href);
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
        </button>
        {menuOpen && (
          <div className="rail-menu">
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
