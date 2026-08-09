"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The agency's navigation.
 *
 * The portal had none: it was a single scrolling page, so a vendor's only
 * model of the product was "everything is here, somewhere below". That works
 * until there is a second destination, and performance is the second
 * destination.
 *
 * Deliberately the same shell and the same classes as the org rail. Both
 * sides are the same product and should feel like it — but this one is
 * simpler on purpose: no worklist counts, no command palette, no white-label
 * accent. An agency logs in a few times a week to do two things, and a rail
 * that implied more would be furniture.
 */

const LINKS = [
  { group: "Work", href: "/vendor", label: "Open roles", icon: "◈", exact: true },
  { group: "Insight", href: "/vendor/analytics", label: "Performance", icon: "◧" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

interface VendorMe {
  kind: string;
  name?: string;
  /** A plain string on this payload, not an object — see /auth/me. */
  vendor?: string;
  organization?: { name: string };
}

export function VendorRail() {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<VendorMe | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const footRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<VendorMe>("/auth/me")
      .then((m) => (m.kind === "vendor" ? setMe(m) : undefined))
      .catch(() => undefined);
  }, []);

  useEffect(() => setNavOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (footRef.current && !footRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const groups = [...new Set(LINKS.map((l) => l.group))];

  return (
    <>
      <button
        type="button"
        className="rail-toggle"
        onClick={() => setNavOpen((v) => !v)}
        aria-label="Menu"
      >
        ☰
      </button>
      <aside className={`rail${navOpen ? " open" : ""}`}>
        <div className="rail-head">
          <Link href="/vendor" className="brand">
            Inter<span className="brand-accent">/</span>VU
          </Link>
          {/* Whose portal, and whose client. A recruiter working four
              agencies' systems in a day needs to know which tab this is. */}
          <div className="rail-brand mono-label">
            {[me?.vendor, me?.organization?.name].filter(Boolean).join(" · ") ||
              "Vendor portal"}
          </div>
        </div>

        <nav className="rail-nav">
          {groups.map((group) => (
            <div key={group}>
              <div className="rail-group mono-label">{group}</div>
              {LINKS.filter((l) => l.group === group).map((l) => {
                const active = l.exact
                  ? pathname === l.href
                  : pathname.startsWith(l.href);
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
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="rail-foot" ref={footRef}>
          <span className="rail-avatar" aria-hidden>
            {initials(me?.name ?? me?.vendor ?? "?")}
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
                  api("/auth/logout", { method: "POST" }).then(() =>
                    router.push("/vendor/login"),
                  )
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
