"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

type Kind = "org" | "vendor";

interface LoginContext {
  mode: "single" | "picker" | "manual";
  organizations: { slug: string; name: string }[];
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [kind, setKind] = useState<Kind>("org");
  const [ctx, setCtx] = useState<LoginContext | null>(null);
  const [orgSlug, setOrgSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<LoginContext>("/auth/login-context")
      .then((c) => {
        setCtx(c);
        // Invite links carry ?org=slug so vendors never type or browse a list.
        const fromUrl = params.get("org");
        if (fromUrl) setOrgSlug(fromUrl);
        else if (c.organizations.length === 1) setOrgSlug(c.organizations[0]!.slug);
        else if (c.mode === "picker" && c.organizations[0]) {
          setOrgSlug(c.organizations[0].slug);
        }
      })
      .catch(() => setCtx({ mode: "manual", organizations: [] }));
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = { org_slug: orgSlug, email, password };
      if (kind === "org") {
        await api("/auth/org/login", { method: "POST", body });
        router.push("/dashboard");
      } else {
        await api("/auth/vendor/login", { method: "POST", body });
        router.push("/vendor");
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const single = ctx?.mode === "single" ? ctx.organizations[0] : undefined;
  const orgLabel = kind === "org" ? "Organization" : "Client organization";

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
        {/* One organization on this deployment: name it, don't ask for it. */}
        {single ? (
          <p className="muted" style={{ margin: "0 0 0.5rem" }}>
            Signing in to <strong>{single.name}</strong>
          </p>
        ) : ctx?.mode === "picker" ? (
          <>
            <label htmlFor="org">{orgLabel}</label>
            <select
              id="org"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              required
            >
              {ctx.organizations.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor="org">{orgLabel}</label>
            <input
              id="org"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              placeholder="acme"
              required
            />
          </>
        )}
        {kind === "vendor" && !single && (
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
          <button disabled={busy || !ctx}>{busy ? "Signing in…" : "Sign in"}</button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="muted">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
