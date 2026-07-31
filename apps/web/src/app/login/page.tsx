"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

type Kind = "org" | "vendor";

export default function LoginPage() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("org");
  const [orgSlug, setOrgSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (kind === "org") {
        await api("/auth/org/login", {
          method: "POST",
          body: { org_slug: orgSlug, email, password },
        });
        router.push("/dashboard");
      } else {
        // Vendors sign in per client organization — see docs/05 §1.
        await api("/auth/vendor/login", {
          method: "POST",
          body: { org_slug: orgSlug, email, password },
        });
        router.push("/vendor");
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Sign in to InterVU</h1>
      <div className="tabs">
        <button
          type="button"
          className={kind === "org" ? "active" : ""}
          onClick={() => setKind("org")}
        >
          Organization
        </button>
        <button
          type="button"
          className={kind === "vendor" ? "active" : ""}
          onClick={() => setKind("vendor")}
        >
          Vendor
        </button>
      </div>
      <form className="card" onSubmit={submit}>
        <label htmlFor="org">
          {kind === "org" ? "Organization" : "Client organization"}
        </label>
        <input
          id="org"
          value={orgSlug}
          onChange={(e) => setOrgSlug(e.target.value)}
          placeholder="acme"
          required
        />
        {kind === "vendor" && (
          <p className="muted" style={{ fontSize: "0.8rem", margin: "0.3rem 0 0" }}>
            Sign in separately for each client you supply candidates to.
          </p>
        )}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div style={{ marginTop: "1rem" }}>
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
