import Link from "next/link";
import { PageHead } from "@/components/page-head";

/**
 * What a refused page renders instead of a bare error string or an endless
 * "Loading…". It says what the page is, why this person cannot see it, and
 * gives them somewhere to go — a refusal with no way back is a dead end.
 */
export function AccessDenied({
  what,
  why,
  back = { href: "/dashboard", label: "Back to Today" },
}: {
  /** What the page would have shown: "This candidate's file". */
  what: string;
  /** One line on who CAN see it, so the next step is obvious. */
  why?: string;
  back?: { href: string; label: string };
}) {
  return (
    <main className="wide">
      <PageHead
        kicker="Not available to your role"
        title={what}
        lede={
          why ??
          "Your role doesn't include this page. If you need it for your work, ask an admin to extend your access."
        }
      />
      <p>
        <Link href={back.href}>← {back.label}</Link>
      </p>
    </main>
  );
}
