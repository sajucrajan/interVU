"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { AuthShell } from "@/components/auth-shell";
import type { OrgMe } from "@/lib/me";

/**
 * "Which job are you here to do?" — asked once after sign-in to anyone who
 * holds more than one persona (docs/09 §7), the way Workday asks manager or
 * employee. First time through, the choice is remembered unless they say
 * otherwise; after that, sign-in opens straight on the remembered one and
 * the switcher in the account menu handles the rest.
 */
function Chooser() {
  const router = useRouter();
  const params = useSearchParams();
  const [me, setMe] = useState<OrgMe | null>(null);
  const [remember, setRemember] = useState<"default" | "ask">("default");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgMe | { kind: "vendor" }>("/auth/me")
      .then((m) => {
        if (m.kind !== "org") return router.replace("/vendor");
        // Nothing to choose: straight through.
        if (m.personas.length < 2 || m.persona) router.replace(next());
        else {
          setMe(m);
          if (m.persona_preference.ask_at_login) setRemember("ask");
        }
      })
      .catch(() => router.replace("/login"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only a same-origin path is honoured, for the same reason as the sign-in form.
  const next = () => {
    const n = params.get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
  };

  async function choose(key: string) {
    setBusy(key);
    setError(null);
    try {
      await api("/auth/persona", { method: "POST", body: { persona: key, remember } });
      // A full load, so every count and menu is built for this persona.
      window.location.assign(next());
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(null);
    }
  }

  if (!me) return <p className="muted">Loading…</p>;

  return (
    <>
      <h1>How are you working today?</h1>
      <p className="muted auth-sub">
        You do more than one job in InterVU. Pick one; you can switch any time
        from the account menu.
      </p>
      <div className="persona-list">
        {me.personas.map((p) => (
          <button
            key={p.key}
            type="button"
            className="persona-card"
            disabled={busy !== null}
            onClick={() => choose(p.key)}
          >
            <span className="persona-card-main">
              <strong>{p.label}</strong>
              <span className="muted">{p.scope}</span>
            </span>
            {p.pending > 0 ? (
              <span className="badge warn">
                {p.pending} waiting
              </span>
            ) : (
              <span className="badge">nothing waiting</span>
            )}
          </button>
        ))}
      </div>
      <div className="persona-remember">
        <label className="persona-option">
          <input
            type="radio"
            name="remember"
            checked={remember === "default"}
            onChange={() => setRemember("default")}
          />
          <span>Open this one next time too. I&apos;ll switch when I need to.</span>
        </label>
        <label className="persona-option">
          <input
            type="radio"
            name="remember"
            checked={remember === "ask"}
            onChange={() => setRemember("ask")}
          />
          <span>Ask me every time I sign in.</span>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

export default function ChoosePersonaPage() {
  return (
    <AuthShell
      variant="org"
      kicker="Organization workspace"
      statement="One sign-in, several jobs. Each persona has its own queue, menus and permissions."
      points={[
        "Today shows only the work of the persona you chose",
        "Anything waiting in another persona is flagged, never hidden",
        "Switch from the account menu, in one click",
      ]}
    >
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <Chooser />
      </Suspense>
    </AuthShell>
  );
}
