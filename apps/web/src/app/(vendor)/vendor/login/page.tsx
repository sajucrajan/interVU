import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

/**
 * External (vendor) sign-in — the internet-facing entry point. It lives under
 * the /vendor route tree so a reverse proxy can publish `/vendor/*` alone and
 * keep the internal workspace private (docs/05 §1). Deliberately makes no
 * mention of the organization workspace.
 */
export default function VendorLoginPage() {
  return (
    <main>
      <h1>Vendor portal</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Sign in to view released positions and submit candidates.
      </p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <LoginForm kind="vendor" />
      </Suspense>
    </main>
  );
}
