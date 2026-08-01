import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";

/**
 * Internal (organization) sign-in. Deployments typically restrict this route
 * to the corporate network / SSO; the external vendor portal has its own
 * entry point at /vendor/login (docs/05 §1).
 */
export default function OrgLoginPage() {
  return (
    <main>
      <h1>Sign in to InterVU</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Organization workspace — positions, candidates, and interviews.
      </p>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <LoginForm kind="org" />
      </Suspense>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Supplying candidates as an agency?{" "}
        <Link href="/vendor/login">Go to the vendor portal</Link>
      </p>
    </main>
  );
}
