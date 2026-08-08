import type { ReactNode } from "react";
import { OrgRail } from "@/components/rail";
import { PageIdentityProvider } from "@/components/sticky-identity";

export default function OrgLayout({ children }: { children: ReactNode }) {
  return (
    <div className="org-shell">
      <OrgRail />
      {/* Its own column, so a section's sub-nav stacks above the page rather
          than becoming a third sibling of the rail. */}
      <div className="org-page">
        {/* The condensed identity bar lives here, not on each page: added
            page by page it reached four screens out of twenty, and an
            affordance you cannot predict is worse than none. */}
        <PageIdentityProvider>{children}</PageIdentityProvider>
      </div>
    </div>
  );
}
