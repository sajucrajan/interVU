"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";
import { usePageIdentity } from "@/components/sticky-identity";

interface Timeline {
  candidate: {
    id: string;
    display_name: string;
    active_flags: { kind: string; reason: string }[];
  };
  applications: { id: string; position: string; team: string; stage: string; status: string }[];
  events: { at: string; type: string; summary: string; detail?: Record<string, unknown> }[];
}

interface Dossier {
  id: string;
  reference: string | null;
  display_name: string;
  current_title: string | null;
  current_employer: string | null;
  location: string | null;
  erased: boolean;
  identities_merged: number;
  vendors: number;
  application_count: number;
  identity_confidence: number | null;
  identity_features: { key: string; label: string; value: number }[];
  identity_signals: { key: string; label: string; tone: "ok" | "warn" }[];
  identities: { id: string; kind: string; value: string; method: string }[];
  sources: {
    id: string;
    vendor: string;
    tier: number;
    submitted_at: string;
    state: "owns" | "blocked" | "expired" | "none";
    window_expires_at: string | null;
  }[];
  merge_events: { id: string; createdAt: string }[];
  prior_outcome: {
    outcome: string;
    reason: string;
    decided_at: string;
    position_title: string;
    position_reference: string | null;
  } | null;
}

/** Timeline node colour by event kind — replaces the emoji map. */
const NODE_COLOR: Record<string, string> = {
  submission: "var(--warn)",
  stage_change: "var(--accent)",
  interview: "var(--accent)",
  scorecard: "var(--ok)",
  decision: "var(--bad)",
  flag: "var(--bad)",
};

const SOURCE_TONE: Record<string, string> = {
  owns: "var(--ok)",
  blocked: "var(--warn)",
  expired: "var(--faint)",
  none: "var(--faint)",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/** A prior outcome is only bad news when it was bad news. */
const OUTCOME = {
  reject: { word: "Rejected", tone: "bad" },
  offer: { word: "Offered", tone: "ok" },
  hold: { word: "Held", tone: "warn" },
} as const;

const ordinal = (n: number) =>
  n === 2 ? "2nd" : n === 3 ? "3rd" : n === 1 ? "1st" : `${n}th`;

export default function CandidateDossierPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tl, setTl] = useState<Timeline | null>(null);
  const [d, setD] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Timeline>(`/candidates/${id}/timeline`)
      .then(setTl)
      .catch(() =>
        // 401 is redirected centrally in lib/api; anything else here really
        // is a scope problem rather than a lost session.
        setError("You don't have access to this candidate's history."),
      );
    api<Dossier>(`/candidates/${id}/dossier`)
      .then(setD)
      .catch(() => undefined);
  }, [id, router]);

  usePageIdentity(
    d ? { label: d.display_name, meta: d.reference ?? "Candidate master" } : null,
  );

  if (error) return <main className="wide error">{error}</main>;
  if (!tl || !d) return <main className="wide muted">Loading…</main>;

  const meta = [
    d.current_title && d.current_employer
      ? `${d.current_title} @ ${d.current_employer}`
      : (d.current_title ?? d.current_employer),
    d.location,
  ].filter(Boolean);

  const unmerge = async (eventId: string) => {
    if (!window.confirm("Un-merge the identities joined by this merge?")) return;
    setBusy(true);
    try {
      await api(`/candidates/merge-events/${eventId}/reverse`, { method: "POST" });
      setD(await api<Dossier>(`/candidates/${id}/dossier`));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wide">
      {/* ---- Header: who they are, and how sure we are it is one person ---- */}
      <header className="dossier-head">
        <div className="dossier-id">
          <span className="monogram" aria-hidden>
            {initials(d.display_name)}
          </span>
          <div>
            <div className="mono-label">
              Candidate master{d.reference ? ` · ${d.reference}` : ""}
            </div>
            <h1 style={{ margin: "10px 0 0", fontSize: 40 }}>{d.display_name}</h1>
            {meta.length > 0 && <p className="dossier-meta">{meta.join(" · ")}</p>}
            <div className="dossier-chips">
              <span className="badge">{d.identities_merged} identities merged</span>
              <span className="badge">
                {d.vendors} vendor{d.vendors === 1 ? "" : "s"}
              </span>
              {d.application_count > 1 && (
                <span className="badge warn">
                  Re-applicant · {ordinal(d.application_count)} time
                </span>
              )}
            </div>
          </div>
        </div>

        {d.identity_confidence !== null && (
          <div className="confidence">
            <div className="mono-label">Identity confidence</div>
            <div className="confidence-value">
              <span
                className="figure"
                style={{
                  color: d.identity_confidence >= 92 ? "var(--ok)" : "var(--warn)",
                }}
              >
                {d.identity_confidence}
              </span>
              <span className="hero-unit">%</span>
            </div>
            {/* The feature breakdown already existed — it was only visible on
                the review queue, not where people decide about the person. */}
            {d.identity_features.map((f) => (
              <div key={f.key} className="feature-row">
                <span className="mono-label feature-name" title={f.label}>
                  {f.label}
                </span>
                <span className="feature-track">
                  <span
                    style={{
                      width: `${f.value}%`,
                      background: f.value >= 80 ? "var(--ok)" : "var(--warn)",
                    }}
                  />
                </span>
                <span className="feature-pct">{f.value}%</span>
              </div>
            ))}
            {/* Diagnostics are statements, not contributions — a boolean has
                no percentage to show. */}
            {d.identity_signals?.length > 0 && (
              <div className="signal-row">
                {d.identity_signals.map((sg) => (
                  <span
                    key={sg.key}
                    className={`badge ${sg.tone === "warn" ? "warn" : "ok"}`}
                  >
                    {sg.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="dossier-split">
        <div>
          <SectionHead
            label="Timeline · all teams, all vendors"
            action={<span className="mono-label">filtered to what you may see</span>}
          />
          <div className="timeline">
            {tl.events.map((e, i) => (
              <div key={i} className="tl-row">
                <span className="tl-date">{dateLabel(e.at)}</span>
                <span
                  className="tl-node"
                  style={{ background: NODE_COLOR[e.type] ?? "var(--faint)" }}
                  aria-hidden
                />
                <div>
                  <div className="tl-title">{e.summary}</div>
                  {e.detail && (
                    <div className="tl-detail">
                      {Object.entries(e.detail)
                        .filter(([, v]) => v !== null && v !== undefined && v !== "")
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <SectionHead label="Applications" />
          <table className="data">
            <thead>
              <tr>
                <th>Position</th>
                <th>Team</th>
                <th>Stage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tl.applications.map((a) => (
                <tr key={a.id}>
                  <td>{a.position}</td>
                  <td className="muted">{a.team}</td>
                  <td>
                    <span className="badge">{a.stage}</span>
                  </td>
                  <td className="muted">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside>
          <SectionHead label="Source history" />
          {d.sources.length === 0 ? (
            <p className="muted">No vendor submissions.</p>
          ) : (
            d.sources.map((s) => (
              <div
                key={s.id}
                className="source-row"
                style={{ borderLeftColor: SOURCE_TONE[s.state] }}
              >
                <div>
                  <div className="source-vendor">{s.vendor}</div>
                  <div className="mono-label">
                    {dateLabel(s.submitted_at)} · tier {s.tier}
                  </div>
                </div>
                {s.state !== "none" && (
                  <span
                    className="badge"
                    style={{
                      color: SOURCE_TONE[s.state],
                      borderColor: SOURCE_TONE[s.state],
                    }}
                    title={
                      s.window_expires_at
                        ? `Ownership window expires ${dateLabel(s.window_expires_at)}`
                        : undefined
                    }
                  >
                    {s.state}
                  </span>
                )}
              </div>
            ))
          )}

          <SectionHead
            label="Merged identities"
            action={
              d.merge_events.length > 0 ? (
                <button
                  type="button"
                  className="linklike"
                  disabled={busy}
                  onClick={() => unmerge(d.merge_events[0]!.id)}
                >
                  Un-merge
                </button>
              ) : undefined
            }
          />
          {d.identities.map((idn) => (
            <div key={idn.id} className="identity-row">
              <div className="identity-value">{idn.value}</div>
              <div className="mono-label">
                {idn.kind} · {idn.method}
              </div>
            </div>
          ))}

          {/* The whole reason cross-team history exists: what another team
              already concluded, before this one repeats the interview. */}
          {d.prior_outcome && (
            <div
              className={`prior-outcome tone-${
                OUTCOME[d.prior_outcome.outcome as keyof typeof OUTCOME]?.tone ?? "warn"
              }`}
            >
              <div className="mono-label">Prior outcome</div>
              <p>
                <strong>
                  {OUTCOME[d.prior_outcome.outcome as keyof typeof OUTCOME]?.word ??
                    d.prior_outcome.outcome}
                </strong>{" "}
                for <strong>{d.prior_outcome.position_title}</strong> in{" "}
                {dateLabel(d.prior_outcome.decided_at)}
                {d.prior_outcome.reason && <> — &ldquo;{d.prior_outcome.reason}&rdquo;</>}.
              </p>
            </div>
          )}

          {tl.candidate.active_flags.length > 0 && (
            <>
              <SectionHead label="Flags" />
              {tl.candidate.active_flags.map((f, i) => (
                <div key={i} className="prior-outcome">
                  <div className="mono-label">{f.kind}</div>
                  <p>{f.reason}</p>
                </div>
              ))}
            </>
          )}

          <p className="muted" style={{ fontSize: 13, marginTop: "var(--step-4)" }}>
            <Link href="/match-reviews">Match review queue →</Link>
          </p>
        </aside>
      </div>
    </main>
  );
}
