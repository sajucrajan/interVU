import type { ReactNode } from "react";
import { OrgNav } from "@/components/nav";

export default function OrgLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <OrgNav />
      {children}
    </>
  );
}
