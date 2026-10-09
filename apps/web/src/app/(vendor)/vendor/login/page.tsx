import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { AuthShell } from "@/components/auth-shell";

/**
 * External (vendor) sign-in — the internet-facing entry point. It lives under
 * the /vendor route tree so a reverse proxy can publish `/vendor/*` alone and
 * keep the internal workspace private (docs/05 §1). Deliberately makes no
 * mention of the organization workspace.
 */
export default function VendorLoginPage() {
  return (
    <AuthShell
      variant="vendor"
      kicker="Vendor portal"
      statement="The roles released to you, and what happened to everyone you sent."
      points={[
        "Open roles with their full skill matrix and rate band",
        "Submit candidates and follow each one's status",
        "Your own funnel, from submitted to offered",
      ]}
    >
      <h1>Sign in</h1>
      <p className="muted auth-sub">For staffing agencies supplying candidates.</p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <LoginForm kind="vendor" />
      </Suspense>
    </AuthShell>
  );
}
