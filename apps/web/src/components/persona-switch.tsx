"use client";

import { useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";

/**
 * Switching persona is a full reload, not a state change: every screen,
 * count and menu is computed for the active persona on the server, and
 * re-fetching them one by one is how a page ends up half in each job.
 */
/**
 * Switch persona and land somewhere that persona can use.
 *
 * Today by default: the page someone was on belongs to the job they were
 * doing, and reloading it as the other persona left a hiring manager's
 * pipeline sitting on "Loading…" for an interviewer. A prompt ON the
 * refused page ("Switch to Interviewer and continue") passes that page
 * explicitly, because there the whole point is to come back to it.
 */
export async function switchPersona(key: string, next = "/dashboard"): Promise<void> {
  await api("/auth/persona", { method: "POST", body: { persona: key } });
  window.location.assign(next);
}

/** The page we are on, for a switch that should come straight back to it. */
export const herePath = () =>
  typeof window === "undefined" ? "/dashboard" : window.location.pathname + window.location.search;

export function SwitchPersonaButton({
  persona,
  label,
  next,
  stay = false,
  className = "secondary",
  children,
}: {
  persona: string;
  label: string;
  /** Where to land. Default Today. */
  next?: string;
  /** Come back to this very page: the prompt sits on the thing refused. */
  stay?: boolean;
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
          switchPersona(persona, stay ? herePath() : next).catch((e) => {
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
        <SwitchPersonaButton persona={required} label={label} className="" stay>
          Switch to {label} and continue →
        </SwitchPersonaButton>
        <a href={back.href}>{back.label}</a>
      </div>
    </main>
  );
}
