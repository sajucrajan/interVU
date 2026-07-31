"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Workspace" },
  { href: "/analytics", label: "Analytics" },
  { href: "/interviews", label: "My interviews" },
];

export function OrgNav() {
  const pathname = usePathname();
  return (
    <nav className="topnav">
      <Link href="/dashboard" className="brand">
        Inter<span className="brand-accent">VU</span>
      </Link>
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
