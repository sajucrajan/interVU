"use client";

import Link from "next/link";
import { PageHead } from "@/components/page-head";
import { SwitchPersonaButton } from "@/components/persona-switch";
import { useMe } from "@/lib/me";

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
  // Refused in this persona, but the person may hold another that can.
  const me = useMe();
  const others = (me?.personas ?? []).filter((p) => p.key !== me?.persona?.key);
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
      {others.length > 0 && (
        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: "var(--step-4)" }}>
          {others.map((p) => (
            <SwitchPersonaButton key={p.key} persona={p.key} label={p.label}>
              Try as {p.label} →
            </SwitchPersonaButton>
          ))}
        </div>
      )}
      <p>
        <Link href={back.href}>← {back.label}</Link>
      </p>
    </main>
  );
}
