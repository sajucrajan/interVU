"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

const LINKS = [
  { href: "/dashboard", label: "Workspace" },
  { href: "/analytics", label: "Analytics" },
  { href: "/match-reviews", label: "Reviews" },
  { href: "/interviews", label: "My interviews" },
];

interface OrgMe {
  kind: string;
  organization?: { name: string; branding?: { accent?: string; product_label?: string } };
}

/**
 * White-label: the product is always InterVU, but the workspace wears the
 * organization's name (and optional accent color from org settings).
 */
export function OrgNav() {
  const pathname = usePathname();
  const [org, setOrg] = useState<OrgMe["organization"] | null>(null);

  useEffect(() => {
    api<OrgMe>("/auth/me")
      .then((me) => {
        if (me.kind !== "org" || !me.organization) return;
        setOrg(me.organization);
        const accent = me.organization.branding?.accent;
        if (accent) {
          document.documentElement.style.setProperty("--accent", accent);
        }
      })
      .catch(() => undefined); // unauthenticated pages just show the plain brand
  }, []);

  return (
    <nav className="topnav">
      <Link href="/dashboard" className="brand">
        Inter<span className="brand-accent">VU</span>
      </Link>
      {org && (
        <span className="org-chip">
          {org.branding?.product_label ?? org.name}
        </span>
      )}
      <div className="topnav-links">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname.startsWith(l.href) ? "active" : ""}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
