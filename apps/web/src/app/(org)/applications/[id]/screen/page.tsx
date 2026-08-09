"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";
import { usePageIdentity } from "@/components/sticky-identity";

interface Requirement {
  skill_id: string;
  name: string;
  must_have: boolean;
  proficiency: string | null;
  min_years: number | null;
  evidenced: boolean;
}

interface Packet {
  application_id: string;
  stage: string;
  status: string;
  interviewed: boolean;
  already_decided: string | null;
  candidate: {
    id: string;
    displayName: string;
    reference: string | null;
    currentTitle: string | null;
    currentEmployer: string | null;
    location: string | null;
  };
  position: {
    id: string;
    title: string;
    reference: string | null;
    seniority: string | null;
    min_total_years: number | null;
    must_haves: string[];
  };
  requirements: Requirement[];
  gaps: Requirement[];
  extra_technologies: { skill_id: string; name: string }[];
  coverage: number | null;
  resume: {
    filename: string;
    sections: { heading: string | null; body: string }[];
    word_count: number;
  } | null;
  history: {
    id: string;
    currentStage: string;
    status: string;
    createdAt: string;
    position: { title: string; reference: string | null };
    decision: { outcome: string } | null;
  }[];
}

/**
 * Screening: is this person worth an interview slot, for THIS role?
 *
 * Position-first on purpose. The candidate dossier answers "who is this
 * person across everything we know"; this answers "do they fit this role",
 * and the same candidate can be an obvious yes for one and an obvious no for
 * the next.
 *
 * The requirement comparison is the same code the interview room uses — one
 * implementation, so nobody screens on one basis and interviews on another.
 */
export default function ScreenPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [p, setP] = useState<Packet | null>(null);
  const [caps, setCaps] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api<Packet>(`/applications/${id}/screening`)
        .then(setP)
        .catch((e) => setError(apiErrorMessage(e))),
    [id],
  );

  useEffect(() => {
    void load();
    api<{ capabilities?: string[] }>("/auth/me")
      .then((m) => setCaps(m.capabilities ?? []))
      .catch(() => setCaps([]));
  }, [load]);

  usePageIdentity(
    p ? { label: p.candidate.displayName, meta: p.position.reference } : null,
  );

  const can = (perm: string) => caps === null || caps.includes(perm);

  async function act(fn: () => Promise<unknown>, thenGo?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (thenGo) router.push(thenGo);
      else await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !p) {
    return (
      <main className="wide">
        <h1>Screening</h1>
        <p className="error">{error}</p>
        <p>
          <Link href="/pipeline">Back to the pipeline</Link>
        </p>
      </main>
    );
  }
  if (!p) return <main className="wide muted">Loading…</main>;

  const c = p.candidate;
  const decided = p.already_decided !== null;

  return (
    <main className="wide screen-page">
      <header className="page-head">
        <div>
          <div className="mono-label">
            Screening ·{" "}
            {p.position.reference && <span className="ref-code">{p.position.reference}</span>}{" "}
            {p.position.title}
          </div>
          <h1 style={{ marginTop: 12 }}>{c.displayName}</h1>
          <p className="dossier-meta">
            {[c.currentTitle, c.currentEmployer, c.location].filter(Boolean).join(" · ") ||
              "No profile details on file"}
          </p>
        </div>
        <div className="screen-coverage">
          <div className="figure">{p.coverage === null ? "—" : `${p.coverage}%`}</div>
          <div className="mono-label">of the matrix evidenced</div>
        </div>
      </header>

      {decided && (
        <p className="badge warn screen-decided">
          Already decided: {p.already_decided}. Nothing below changes that.
        </p>
      )}

      <div className="screen-grid">
        <div>
          <SectionHead label="What the role needs" />
          <table className="data screen-reqs">
            <thead>
              <tr>
                <th>Competency</th>
                <th>Level</th>
                <th>In the CV</th>
              </tr>
            </thead>
            <tbody>
              {p.requirements.map((r) => (
                <tr key={r.skill_id} className={r.must_have && !r.evidenced ? "gap-row" : ""}>
                  <td>
                    <span className={`skill-chip${r.must_have ? " must" : ""}`}>
                      {r.name}
                    </span>
                  </td>
                  <td className="muted">
                    {[r.proficiency, r.min_years ? `${r.min_years}y` : null]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td>
                    {r.evidenced ? (
                      <span className="badge ok">mentioned</span>
                    ) : (
                      <span className={`badge ${r.must_have ? "bad" : ""}`}>
                        not mentioned
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {p.gaps.length > 0 && (
            <div className="room-gaps">
              <div className="mono-label">Must-haves with no evidence in the CV</div>
              <p>
                {p.gaps.map((g) => g.name).join(", ")} — worth a question before
                you decide. Absence from a resume is not absence of the skill,
                and rejecting on it filters for CV writing.
              </p>
            </div>
          )}

          {p.position.must_haves.length > 0 && (
            <>
              <SectionHead label="Screening requirements" />
              <ul className="room-list">
                {p.position.must_haves.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}

          {p.extra_technologies.length > 0 && (
            <>
              <SectionHead label="Also mentioned" />
              <div className="room-chips">
                {p.extra_technologies.map((t) => (
                  <span key={t.skill_id} className="skill-chip">
                    {t.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {p.history.length > 0 && (
            <>
              <SectionHead label="Considered before" />
              <ul className="room-list">
                {p.history.map((h) => (
                  <li key={h.id}>
                    {h.position.reference && (
                      <span className="ref-code">{h.position.reference}</span>
                    )}{" "}
                    {h.position.title} · {h.currentStage}
                    {h.decision ? ` · ${h.decision.outcome}` : ""} ·{" "}
                    {new Date(h.createdAt).toLocaleDateString()}
                  </li>
                ))}
              </ul>
              <p className="muted room-hint">
                Someone turned down for one role may be right for this one.
                Three rejections is a different signal from one.
              </p>
            </>
          )}

          <SectionHead label="Resume" />
          {p.resume ? (
            <div className="room-resume">
              <div className="mono-label">
                {p.resume.filename} · {p.resume.word_count} words
              </div>
              {p.resume.sections.map((s, i) => (
                <div key={i} className="room-section">
                  {s.heading && <h3>{s.heading}</h3>}
                  <pre>{s.body}</pre>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              No resume on this application — a direct applicant has no vendor
              submission to carry one.
            </p>
          )}
        </div>

        <aside className="screen-actions">
          <SectionHead label="Your call" />
          {p.interviewed && (
            <p className="muted room-hint">
              Someone has already interviewed this candidate, so a rejection
              here is a panel outcome — it goes through the debrief.
            </p>
          )}

          {can("applications.transition") && !decided && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      api(`/applications/${id}/transition`, {
                        method: "POST",
                        body: { to_stage: "interviewing" },
                      }),
                    "/pipeline",
                  )
                }
              >
                Advance to interviewing
              </button>
              {p.stage === "submitted" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      api(`/applications/${id}/transition`, {
                        method: "POST",
                        body: { to_stage: "screening" },
                      }),
                    )
                  }
                >
                  Mark as screening
                </button>
              )}
            </>
          )}

          {!decided && !p.interviewed && can("applications.reject") && (
            <>
              <label style={{ marginTop: "var(--step-4)" }}>
                Why not, in your words
              </label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Six years short on the platform side; no Kubernetes anywhere in the history."
              />
              <p className="muted room-hint">
                Internal. It is what a colleague reads before re-screening the
                same person in three months.
              </p>
              <button
                className="danger"
                disabled={busy || reason.trim().length === 0}
                onClick={() =>
                  act(
                    () =>
                      api(`/applications/${id}/decision`, {
                        method: "POST",
                        body: { outcome: "reject", reason },
                      }),
                    "/pipeline",
                  )
                }
              >
                Reject at screening
              </button>
              {reason.trim().length === 0 && (
                <p className="muted room-hint">
                  A reason is required — an unexplained rejection teaches the
                  next screener nothing.
                </p>
              )}
            </>
          )}

          {p.interviewed && (
            <p style={{ marginTop: "var(--step-4)" }}>
              <Link href={`/applications/${id}/debrief`}>Open the debrief →</Link>
            </p>
          )}

          {error && <p className="error">{error}</p>}
          <p className="muted room-hint" style={{ marginTop: "var(--step-5)" }}>
            <Link href={`/candidates/${c.id}`}>Full candidate history →</Link>
          </p>
        </aside>
      </div>
    </main>
  );
}
