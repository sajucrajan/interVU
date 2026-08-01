"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";

/** Each administrative area has its own permission; show only what applies. */
const TABS = [
  { href: "/admin/people", label: "People", needs: "org.manage_users" },
  { href: "/admin/teams", label: "Teams", needs: "org.manage_structure" },
  { href: "/admin/vendors", label: "Vendors", needs: "vendors.manage" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [caps, setCaps] = useState<string[] | null>(null);

  useEffect(() => {
    api<{ capabilities?: string[] }>("/auth/me")
      .then((me) => setCaps(me.capabilities ?? []))
      .catch(() => setCaps([]));
  }, []);

  const visible = TABS.filter((t) => !caps || caps.includes(t.needs));

  return (
    <>
      <nav className="subnav">
        {visible.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={pathname.startsWith(t.href) ? "active" : ""}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
