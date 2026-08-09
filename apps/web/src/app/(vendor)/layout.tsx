"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { VendorRail } from "@/components/vendor-rail";

/**
 * The portal shell.
 *
 * Login is deliberately excluded. It sits inside this route group, but a nav
 * rail on a sign-in page advertises destinations for a session you do not
 * have yet — every link 401s, and the account footer renders an empty name
 * where a person should be. Excluding by path rather than restructuring the
 * routes keeps /vendor/login where every existing link and the seed's printed
 * instructions already point.
 */
export default function VendorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/vendor/login") return <>{children}</>;

  return (
    <div className="org-shell">
      <VendorRail />
      <div className="org-page">{children}</div>
    </div>
  );
}
