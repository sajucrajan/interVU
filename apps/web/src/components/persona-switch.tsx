"use client";

import { useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";

/**
 * Switching persona is a full reload, not a state change: every screen,
 * count and menu is computed for the active persona on the server, and
 * re-fetching them one by one is how a page ends up half in each job.
 */
export async function switchPersona(key: string, next?: string): Promise<void> {
  await api("/auth/persona", { method: "POST", body: { persona: key } });
  window.location.assign(next ?? window.location.pathname + window.location.search);
}

export function SwitchPersonaButton({
  persona,
  label,
  next,
  className = "secondary",
  children,
}: {
  persona: string;
  label: string;
  next?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          switchPersona(persona, next).catch((e) => {
            setError(apiErrorMessage(e));
            setBusy(false);
          });
        }}
      >
        {children ?? `Switch to ${label} →`}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}

/**
 * What a page shows when the server says "this belongs to another persona":
 * the thing is theirs, just not in the job they are doing right now.
 */
export function PersonaMismatch({
  what,
  required,
  label,
  back,
}: {
  what: string;
  required: string;
  label: string;
  back: { href: string; label: string };
}) {
  return (
    <main className="wide">
      <header className="page-head">
        <div className="page-head-main">
          <div className="mono-label">In another persona</div>
          <h1 style={{ marginTop: 12 }}>{what}</h1>
          <p className="dossier-meta" style={{ maxWidth: "64ch" }}>
            This is yours, but it belongs to your <strong>{label}</strong> persona.
            Switching changes your menus and queue to that job; nothing is lost.
          </p>
        </div>
      </header>
      <div className="row" style={{ gap: 12 }}>
        <SwitchPersonaButton persona={required} label={label} className="">
          Switch to {label} and continue →
        </SwitchPersonaButton>
        <a href={back.href}>{back.label}</a>
      </div>
    </main>
  );
}
