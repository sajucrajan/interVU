"use client";

import Link from "next/link";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";
import { usePageIdentity } from "@/components/sticky-identity";

interface Cell {
  panelist_id: string;
  rating: number | null;
}

interface Row {
  skill_id: string;
  name: string;
  must_have: boolean;
  cells: Cell[];
  spread: number;
  diverged: boolean;
  consensus: string;
}

interface Debrief {
  application_id: string;
  candidate: { id: string; displayName: string; reference: string | null };
  position: { id: string; title: string; reference: string | null };
  visible: boolean;
  filed_count: number;
  expected_count: number;
  outstanding: string[];
  panel_mean: number | null;
  divergence: "high" | "low";
  recommendations: { key: string; count: number }[];
  competencies: Row[];
  panelists: { id: string; name: string; initials: string }[];
  divergence_row: Row | null;
  scorecards: {
    id: string;
    panelist: string;
    initials: string;
    round: string;
    rating: number;
    recommendation: string;
    notes: string;
    turnaround_hours: number;
  }[];
  decision: { outcome: string; reason: string } | null;
  debrief: {
    id: string;
    status: string;
    internal_reason: string;
    released_at: string | null;
    packet: {
      headline: string;
      summary: string;
      strengths: string[];
      gaps: string[];
      reconsiderFor: string | null;
      isDraft: boolean;
    } | null;
  } | null;
}

const REC_LABEL: Record<string, string> = {
  strong_yes: "Strong yes",
  yes: "Yes",
  no: "No",
  strong_no: "Strong no",
};

const REC_COLOR: Record<string, string> = {
  strong_yes: "var(--ok)",
  yes: "var(--accent)",
  no: "var(--bad)",
  strong_no: "var(--bad)",
};

/** Cell tone by rating — never by the brand accent. */
const cellTone = (r: number | null) =>
  r === null
    ? { bg: "transparent", fg: "var(--faint)" }
    : r >= 4
      ? { bg: "var(--ok-wash)", fg: "var(--ok)" }
      : r === 3
        ? { bg: "var(--sunk)", fg: "var(--muted)" }
        : { bg: "var(--warn-wash)", fg: "var(--warn)" };

export default function DebriefPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Debrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Composer state.
  const [reason, setReason] = useState("");
  const [summary, setSummary] = useState("");
  const [headline, setHeadline] = useState("Not selected");
  const [reconsider, setReconsider] = useState("");
  const [toggles, setToggles] = useState({
    outcome: true,
    tags: true,
    hint: true,
    rounds: false,
  });
  const [edited, setEdited] = useState(false);

  const load = useCallback(() => {
    api<Debrief>(`/applications/${id}/debrief`)
      .then((r) => {
        setD(r);
        setReason(r.debrief?.internal_reason ?? "");
        if (r.debrief?.packet) {
          setSummary(r.debrief.packet.summary);
          setHeadline(r.debrief.packet.headline || "Not selected");
          setReconsider(r.debrief.packet.reconsiderFor ?? "");
          setEdited(!r.debrief.packet.isDraft);
        }
      })
      .catch((e) => setError(apiErrorMessage(e)));
  }, [id]);

  useEffect(load, [load]);

  // Above the early returns: a hook skipped on the error path changes the
  // hook count between renders, and React throws — which surfaces as a bare
  // "client-side exception" with nothing pointing at the cause. This page
  // returns early on 403, so it hit that the moment recruiters could reach it.
  usePageIdentity(
    d
      ? {
          label: d.candidate.displayName,
          meta: `${d.position.reference ?? ""} ${d.position.title}`.trim(),
        }
      : null,
  );

  if (error) return <main className="wide error">{error}</main>;

  if (!d) return <main className="wide muted">Loading…</main>;

  const strengths = d.competencies.filter((r) => r.consensus === "strong").map((r) => r.name);
  const gaps = d.competencies
    .filter((r) => r.consensus === "below bar" || r.diverged)
    .map((r) => r.name);

  /** Drafted from the consensus row and the weakest competencies — never sent
   *  unedited, which is what `is_draft` enforces on the server. */
  const autoDraft = () => {
    const s = strengths.slice(0, 3).join(", ");
    const g = gaps.slice(0, 2).join(" and ");
    setSummary(
      `${d.candidate.displayName.split(" ")[0]} interviewed strongly on ${s || "several areas"}.` +
        (g ? ` The bar not cleared was ${g}.` : ""),
    );
  };

  const savePacket = async (isDraft: boolean) => {
    await api(`/applications/${id}/debrief/packet`, {
      method: "POST",
      body: {
        visibility: "vendor",
        headline: toggles.outcome ? headline : "",
        summary: toggles.outcome ? summary : "",
        strengths: toggles.tags ? strengths : [],
        gaps: toggles.tags ? gaps : [],
        reconsider_for: toggles.hint && reconsider ? reconsider : null,
        is_draft: isDraft,
      },
    });
  };

  const commit = async (release: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/applications/${id}/debrief`, {
        method: "PATCH",
        body: { internal_reason: reason },
      });
      // Releasing requires the summary to have been reviewed; saving it as a
      // non-draft IS the reviewer saying so.
      await savePacket(!edited);
      if (release) await api(`/applications/${id}/debrief/release`, { method: "POST" });
      load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const totalRecs = d.recommendations.reduce((n, r) => n + r.count, 0) || 1;

  return (
    <main className="wide">
      <header className="page-head">
        <div>
          <div className="mono-label">
            Debrief ·{" "}
            <Link href={`/positions/${d.position.id}`} className="ref-link">
              {d.position.reference} {d.position.title}
            </Link>
          </div>
          <h1 style={{ marginTop: 12, fontSize: 40 }}>{d.candidate.displayName}</h1>
          <p className="dossier-meta">
            {d.filed_count} of {d.expected_count} scorecards filed
            {d.outstanding.length > 0 && ` · chase ${d.outstanding.join(", ")}`}
          </p>
        </div>
        <div className="head-stats">
          <div className="head-stat">
            <div className="mono-label">Panel mean</div>
            <div className="figure head-stat-value">{d.panel_mean ?? "—"}</div>
          </div>
          <div className="head-stat">
            <div className="mono-label">Divergence</div>
            <div
              className="figure head-stat-value"
              style={{ color: d.divergence === "high" ? "var(--warn)" : "var(--ok)" }}
            >
              {d.divergence === "high" ? "High" : "Low"}
            </div>
          </div>
        </div>
      </header>

      {/* The hide-until-submitted policy governs the whole screen: seeing a
          colleague's rating first changes what you write. */}
      {!d.visible ? (
        <div className="empty-state">
          <span className="empty-icon">◷</span>
          <div>
            <strong>Sealed until every panelist has filed.</strong>
            <p className="muted" style={{ margin: 0 }}>
              {d.filed_count} of {d.expected_count} in
              {d.outstanding.length > 0 && ` — waiting on ${d.outstanding.join(", ")}`}.
            </p>
          </div>
        </div>
      ) : (
        <div className="debrief-split">
          <div>
            <SectionHead label="Recommendations" />
            <div className="rec-bar">
              {d.recommendations
                .filter((r) => r.count > 0)
                .map((r) => (
                  <span
                    key={r.key}
                    className="figure rec-seg"
                    style={{
                      width: `${(r.count / totalRecs) * 100}%`,
                      background: REC_COLOR[r.key],
                    }}
                    title={REC_LABEL[r.key]}
                  >
                    {r.count}
                  </span>
                ))}
            </div>
            <div className="stage-legend">
              {d.recommendations
                .filter((r) => r.count > 0)
                .map((r) => (
                  <span key={r.key}>
                    <i style={{ background: REC_COLOR[r.key] }} />
                    {REC_LABEL[r.key]}
                  </span>
                ))}
            </div>

            <SectionHead
              label="Competency matrix"
              action={<span className="mono-label">rows follow the position&apos;s skill matrix</span>}
            />
            <table className="data matrix">
              <thead>
                <tr>
                  <th>Competency</th>
                  {d.panelists.map((p) => (
                    <th key={p.id} className="num" title={p.name}>
                      {p.initials}
                    </th>
                  ))}
                  <th className="num">Consensus</th>
                </tr>
              </thead>
              <tbody>
                {d.competencies.map((r) => (
                  // A row the panel disagrees on is the conversation; wash it
                  // so it cannot be skimmed past.
                  <tr key={r.skill_id} className={r.diverged ? "diverged" : ""}>
                    <td>
                      <strong>{r.name}</strong>
                      {r.must_have && <span className="must-star"> ★</span>}
                    </td>
                    {d.panelists.map((p) => {
                      const cell = r.cells.find((c) => c.panelist_id === p.id);
                      const tone = cellTone(cell?.rating ?? null);
                      return (
                        <td key={p.id} className="num">
                          <span
                            className="matrix-cell"
                            style={{ background: tone.bg, color: tone.fg }}
                          >
                            {cell?.rating ?? "—"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="num">
                      <span
                        className="mono-label"
                        style={{
                          color: r.diverged
                            ? "var(--warn)"
                            : r.consensus === "strong"
                              ? "var(--ok)"
                              : r.consensus === "below bar"
                                ? "var(--warn)"
                                : "var(--muted)",
                        }}
                      >
                        {r.consensus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {d.divergence_row && (
              <div className="leak" style={{ borderLeftColor: "var(--warn)" }}>
                <div className="mono-label">Divergence · resolve before deciding</div>
                <p>
                  <strong>{d.divergence_row.name}</strong> splits the panel by{" "}
                  {d.divergence_row.spread} points against the same rubric. A tie-break
                  round or a written rebuttal is cheaper than a wrong offer.
                </p>
              </div>
            )}

            <SectionHead
              label="Scorecards"
              action={
                <span className="mono-label">visible because all {d.expected_count} are filed</span>
              }
            />
            {d.scorecards.map((s) => (
              <div
                key={s.id}
                className="scorecard-row"
                style={{ borderLeftColor: REC_COLOR[s.recommendation] }}
              >
                <div className="sc-who">
                  <span
                    className="sc-initials"
                    style={{ background: REC_COLOR[s.recommendation] }}
                  >
                    {s.initials}
                  </span>
                  <div>
                    <div className="sc-name">{s.panelist}</div>
                    <div className="mono-label">{s.round}</div>
                  </div>
                </div>
                <div>
                  <span
                    className="badge"
                    style={{
                      color: REC_COLOR[s.recommendation],
                      borderColor: REC_COLOR[s.recommendation],
                    }}
                  >
                    {REC_LABEL[s.recommendation]}
                  </span>
                  <p className="sc-notes">{s.notes}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="figure sc-rating">{s.rating}</div>
                  <div className="mono-label">
                    filed {Math.round(s.turnaround_hours)}h after
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ---- Decision and composer ---- */}
          <aside className="debrief-side">
            <SectionHead label="Internal reason" />
            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Never leaves the organization."
            />

            <SectionHead label="Feedback to vendor" />
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
              Composed from the panel, never copied verbatim. Choose what leaves the
              building.
            </p>

            {(
              [
                ["outcome", "Outcome & summary", "Auto-drafted from the consensus row, editable"],
                ["tags", "Strengths & gaps as tags", "Names the competency, never the score"],
                ["hint", "“Would consider for…” hint", "Tells the vendor what to send next"],
                ["rounds", "Round-by-round breakdown", "Off by default — reveals loop structure"],
              ] as const
            ).map(([key, label, help]) => (
              <label key={key} className="toggle-row">
                <input
                  type="checkbox"
                  checked={toggles[key]}
                  onChange={(e) => setToggles({ ...toggles, [key]: e.target.checked })}
                />
                <span>
                  <span className="toggle-label">{label}</span>
                  <span className="toggle-help">{help}</span>
                </span>
              </label>
            ))}

            {toggles.outcome && (
              <>
                <label style={{ marginTop: "var(--step-3)" }}>Summary</label>
                <textarea
                  rows={5}
                  value={summary}
                  onChange={(e) => {
                    setSummary(e.target.value);
                    setEdited(true);
                  }}
                />
                <button type="button" className="secondary" onClick={autoDraft}>
                  Auto-draft
                </button>
              </>
            )}
            {toggles.hint && (
              <>
                <label style={{ marginTop: "var(--step-3)" }}>Would consider for…</label>
                <input value={reconsider} onChange={(e) => setReconsider(e.target.value)} />
              </>
            )}

            {/* The actual component the vendor sees, not a description of it. */}
            <SectionHead label="What the vendor will see" />
            <div className="feedback-block">
              <div className="feedback-head">
                <strong>{d.candidate.displayName}</strong>
                <span className="feedback-outcome">{headline}</span>
              </div>
              <div className="feedback-body">
                {toggles.outcome && <p className="feedback-summary">{summary || "—"}</p>}
                {toggles.tags && (
                  <div className="row" style={{ gap: 6 }}>
                    {strengths.map((t) => (
                      <span key={t} className="badge ok">
                        {t}
                      </span>
                    ))}
                    {gaps.map((t) => (
                      <span key={t} className="badge warn">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {toggles.hint && reconsider && (
                  <div className="reconsider">
                    Would consider for <strong>{reconsider}</strong>.
                  </div>
                )}
              </div>
            </div>

            <div className="never-leaves">
              <div className="mono-label" style={{ color: "var(--bad)" }}>
                Never leaves the building
              </div>
              <ul>
                <li>Interviewer names or roles</li>
                <li>Numeric ratings and the matrix</li>
                <li>Raw scorecard notes</li>
                <li>Internal decision reason</li>
                <li>Panel disagreement</li>
              </ul>
            </div>

            {d.debrief?.released_at ? (
              <p className="badge ok" style={{ display: "inline-block" }}>
                Released {new Date(d.debrief.released_at).toLocaleDateString()}
              </p>
            ) : (
              <div style={{ marginTop: "var(--step-4)" }}>
                <button
                  type="button"
                  disabled={busy || !edited}
                  title={edited ? undefined : "Edit or auto-draft the summary first"}
                  onClick={() => commit(true)}
                >
                  {busy ? "Saving…" : "Record decision & release feedback"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  style={{ marginTop: 8, width: "100%" }}
                  onClick={() => commit(false)}
                >
                  Record decision, hold feedback
                </button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <p className="muted" style={{ fontSize: 13 }}>
              <button
                type="button"
                className="linklike"
                onClick={() => router.push("/pipeline")}
              >
                ← Back to pipeline
              </button>
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
