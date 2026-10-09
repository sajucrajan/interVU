import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { AuthShell } from "@/components/auth-shell";

/**
 * Internal (organization) sign-in. Deployments typically restrict this route
 * to the corporate network / SSO; the external vendor portal has its own
 * entry point at /vendor/login (docs/05 §1).
 */
export default function OrgLoginPage() {
  return (
    <AuthShell
      variant="org"
      kicker="Organization workspace"
      statement="Every agency candidate, one pipeline, and a record of who introduced whom."
      points={[
        "Positions, and when each agency gets to see them",
        "Candidates, duplicate claims and ownership",
        "Interviews, scorecards and the debrief",
      ]}
    >
      <h1>Sign in</h1>
      <p className="muted auth-sub">
        For recruiters, hiring managers and interviewers.
      </p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <LoginForm kind="org" />
      </Suspense>
      <p className="muted auth-alt">
        Supplying candidates as an agency?{" "}
        <Link href="/vendor/login">Go to the vendor portal</Link>
      </p>
    </AuthShell>
  );
}
