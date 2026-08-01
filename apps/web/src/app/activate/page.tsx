import { Suspense } from "react";
import { ActivateForm } from "@/components/activate-form";

/**
 * Invitation redemption. Reached from the link in an invite email, so it sits
 * outside both the org and vendor layouts — the visitor has no session yet.
 */
export default function ActivatePage() {
  return (
    <main>
      <h1>Set your password</h1>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <ActivateForm />
      </Suspense>
    </main>
  );
}
