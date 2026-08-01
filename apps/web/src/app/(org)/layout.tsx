import type { ReactNode } from "react";
import { OrgRail } from "@/components/rail";

export default function OrgLayout({ children }: { children: ReactNode }) {
  return (
    <div className="org-shell">
      <OrgRail />
      {/* Its own column, so a section's sub-nav stacks above the page rather
          than becoming a third sibling of the rail. */}
      <div className="org-page">{children}</div>
    </div>
  );
}
