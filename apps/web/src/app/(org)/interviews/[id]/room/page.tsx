"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";
import { VoteButtons } from "@/components/vote";

interface Competency {
  skill_id: string;
  name: string;
  must_have: boolean;
  proficiency: string | null;
  min_years: number | null;
  evidenced: boolean;
}

interface Question {
  id: string;
  prompt: string;
  rubric: string[];
  follow_ups: string[];
  kind: string;
  level: number;
  created_by: string | null;
  skills: { id: string; name: string }[];
  times_asked: number;
  discrimination: number | null;
  signal_basis: string;
  score: number;
  up: number;
  down: number;
  my_vote: number;
}

interface QuestionGroup {
  skill_id: string;
  name: string;
  must_have: boolean;
  questions: Question[];
}

interface Packet {
  interview: {
    id: string;
    round_name: string;
    scheduled_at: string;
    duration_min: number;
    location_or_link: string | null;
    status: string;
  };
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
  application_id: string;
  panel: { name: string; filed: boolean; is_me: boolean }[];
  prior_rounds: {
    round_name: string;
    scheduled_at: string;
    status: string;
    scorecards_filed: number;
  }[];
  resume: {
    filename: string;
    downloadable: boolean;
    sections: { heading: string | null; body: string }[];
    word_count: number;
  } | null;
  competencies: Competency[];
  question_groups: QuestionGroup[];
  gaps: Competency[];
  extra_technologies: { skill_id: string; name: string }[];
  my_scorecard_filed: boolean;
}

interface DraftPayload {
  ratings?: Record<string, number>;
  notes?: Record<string, string>;
  overall?: number;
  recommendation?: string;
  asked?: string[];
}

const RECOMMENDATIONS = [
  { key: "strong_yes", label: "Strong yes" },
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
  { key: "strong_no", label: "Strong no" },
];

/** Collapsed by default: during a call you want the prompt, not an essay. */
function QuestionCard({
  question: q,
  asked,
  onToggle,
}: {
  question: Question;
  asked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`room-q${asked ? " asked" : ""}`}>
      <div className="room-q-head">
        <label className="room-q-ask">
          <input type="checkbox" checked={asked} onChange={onToggle} />
          <span>{q.prompt}</span>
        </label>
        <div className="room-q-actions">
          <VoteButtons
            questionId={q.id}
            compact
            initial={{ score: q.score, up: q.up, down: q.down, my_vote: q.my_vote }}
          />
          <button type="button" className="room-q-more" onClick={() => setOpen((v) => !v)}>
            {open ? "less" : "more"}
          </button>
        </div>
      </div>
      <div className="mono-label room-q-meta">
        L{q.level} · {q.kind.replace("_", " ")} ·{" "}
        {q.discrimination !== null
          ? `spread ${q.discrimination} over ${q.times_asked} asks`
          : q.signal_basis}
      </div>
      {open && (
        <div className="room-q-body">
          {q.rubric.length > 0 && (
            <>
              <div className="mono-label">A strong answer usually covers</div>
              <ul>
                {q.rubric.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {q.follow_ups.length > 0 && (
            <>
              <div className="mono-label">If the answer is thin</div>
              <ul>
                {q.follow_ups.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </>
          )}
          {q.created_by && (
            <p className="muted room-q-by">Added by {q.created_by}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The interview room (docs/01 §interviewer).
 *
 * Built to be open DURING the call, which drives every layout decision: the
 * candidate on the left to glance at, the competencies on the right to type
 * into, and no scrolling required to reach either.
 *
 * The important idea is that notes taken here ARE the scorecard. The old flow
 * made people reconstruct an interview from memory an hour later, which is
 * both why turnaround slipped and why so many scorecards said little. Notes
 * autosave, so a refresh or a closed laptop mid-call costs nothing.
 *
 * What is deliberately absent: any other panelist's ratings or notes. The
 * room shows only WHO has filed. Hide-until-submitted exists to stop exactly
 * the anchoring that would otherwise happen here.
 */
export default function InterviewRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [packet, setPacket] = useState<Packet | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [overall, setOverall] = useState(3);
  const [recommendation, setRecommendation] = useState("");
  const [asked, setAsked] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    api<Packet>(`/interviews/${id}/room`)
      .then(setPacket)
      .catch((e) => setError(apiErrorMessage(e)));
    api<{ payload: DraftPayload }>(`/interviews/${id}/draft`)
      .then((d) => {
        setRatings(d.payload?.ratings ?? {});
        setNotes(d.payload?.notes ?? {});
        if (d.payload?.overall) setOverall(d.payload.overall);
        if (d.payload?.recommendation) setRecommendation(d.payload.recommendation);
        setAsked(d.payload?.asked ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        loaded.current = true;
      });
  }, [id]);

  // Debounced autosave. Skipped until the draft has loaded, so an empty
  // initial state can never overwrite notes taken earlier in the call.
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      api<{ saved_at: string }>(`/interviews/${id}/draft`, {
        method: "PUT",
        body: { ratings, notes, overall, recommendation, asked },
      })
        .then((r) => setSavedAt(r.saved_at))
        .catch(() => undefined);
    }, 1200);
    return () => clearTimeout(t);
  }, [id, ratings, notes, overall, recommendation, asked]);

  const setNote = useCallback(
    (skillId: string, value: string) =>
      setNotes((prev) => ({ ...prev, [skillId]: value })),
    [],
  );

  async function file() {
    if (!recommendation) {
      setError("Pick a recommendation before filing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/interviews/${id}/scorecards`, {
        method: "POST",
        body: {
          overall_rating: overall,
          recommendation,
          asked_question_ids: asked,
          notes: notes.__overall ?? "",
          competencies: Object.entries(ratings).map(([skill_id, rating]) => ({
            skill_id,
            rating,
            note: notes[skill_id] || undefined,
          })),
        },
      });
      router.push("/interviews");
    } catch (e) {
      setError(apiErrorMessage(e));
      setBusy(false);
    }
  }

  if (error && !packet) {
    return (
      <main className="wide">
        <h1>Interview room</h1>
        <p className="error">{error}</p>
        <p>
          <Link href="/interviews">Back to my interviews</Link>
        </p>
      </main>
    );
  }
  if (!packet) return <main className="wide muted">Loading…</main>;

  const c = packet.candidate;
  const assessed = Object.keys(ratings).length;

  return (
    <main className="wide room">
      <header className="room-head">
        <div>
          <div className="mono-label">
            {packet.position.reference && (
              <span className="ref-code">{packet.position.reference}</span>
            )}{" "}
            {packet.position.title} · {packet.interview.round_name}
          </div>
          <h1>{c.displayName}</h1>
          <p className="room-sub">
            {[c.currentTitle, c.currentEmployer, c.location]
              .filter(Boolean)
              .join(" · ") || "No profile details on file"}
          </p>
        </div>
        <div className="room-status">
          <span className="mono-label">
            {packet.panel.filter((p) => p.filed).length}/{packet.panel.length} filed
          </span>
          <span className="mono-label">
            {savedAt ? `notes saved ${new Date(savedAt).toLocaleTimeString()}` : "notes autosave"}
          </span>
          <Link href="/interviews">Close</Link>
        </div>
      </header>

      {packet.my_scorecard_filed && (
        <p className="badge ok room-filed">
          You have already filed for this round — anything below is a new draft.
        </p>
      )}

      <div className="room-grid">
        {/* ---- left: who you are about to talk to ---- */}
        <div className="room-left">
          <SectionHead label="Required, and whether the CV shows it" />
          <div className="room-chips">
            {packet.competencies.map((k) => (
              <span
                key={k.skill_id}
                className={`skill-chip${k.must_have ? " must" : ""}${
                  k.evidenced ? "" : " absent"
                }`}
                title={
                  k.evidenced
                    ? "Mentioned in the resume"
                    : "Not mentioned in the resume"
                }
              >
                {k.name}
                {k.min_years ? ` ${k.min_years}y` : ""}
              </span>
            ))}
          </div>

          {packet.gaps.length > 0 && (
            <div className="room-gaps">
              <div className="mono-label">Must-haves with no evidence in the CV</div>
              <p>
                {packet.gaps.map((g) => g.name).join(", ")} — worth opening on.
                Absence from a resume is not absence of the skill.
              </p>
            </div>
          )}

          {packet.extra_technologies.length > 0 && (
            <>
              <SectionHead label="Also mentioned" />
              <div className="room-chips">
                {packet.extra_technologies.map((t) => (
                  <span key={t.skill_id} className="skill-chip">
                    {t.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {packet.position.must_haves.length > 0 && (
            <>
              <SectionHead label="Screening requirements" />
              <ul className="room-list">
                {packet.position.must_haves.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}

          {packet.prior_rounds.length > 0 && (
            <>
              <SectionHead label="Earlier rounds" />
              <ul className="room-list">
                {packet.prior_rounds.map((r, i) => (
                  <li key={i}>
                    {r.round_name} ·{" "}
                    {new Date(r.scheduled_at).toLocaleDateString()} · {r.status}
                    {r.scorecards_filed > 0
                      ? ` · ${r.scorecards_filed} scorecard${r.scorecards_filed === 1 ? "" : "s"} filed`
                      : ""}
                  </li>
                ))}
              </ul>
              <p className="muted room-hint">
                What was said in them stays sealed until everyone on this round
                has filed.
              </p>
            </>
          )}

          {packet.question_groups.some((g) => g.questions.length > 0) && (
            <>
              <SectionHead label="Questions for this round" />
              <p className="muted room-hint">
                From the shared bank, covering the competencies this round
                grades. Tick what you actually ask — that is what teaches the
                bank which questions separate people.{" "}
                <Link href="/questions">Browse or add</Link>
              </p>
              {packet.question_groups
                .filter((g) => g.questions.length > 0)
                .map((g) => (
                  <div key={g.skill_id} className="room-qgroup">
                    <div className="mono-label">
                      {g.name}
                      {g.must_have ? " · must-have" : ""}
                    </div>
                    {g.questions.map((q) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                        asked={asked.includes(q.id)}
                        onToggle={() =>
                          setAsked((prev) =>
                            prev.includes(q.id)
                              ? prev.filter((x) => x !== q.id)
                              : [...prev, q.id],
                          )
                        }
                      />
                    ))}
                  </div>
                ))}
            </>
          )}

          <SectionHead label="Resume" />
          {packet.resume ? (
            <div className="room-resume">
              <div className="mono-label">
                {packet.resume.filename} · {packet.resume.word_count} words
                {packet.resume.downloadable ? "" : " · original not retained"}
              </div>
              {packet.resume.sections.map((s, i) => (
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

        {/* ---- right: what you are here to decide ---- */}
        <aside className="room-right">
          <SectionHead label={`Score as you go · ${assessed}/${packet.competencies.length}`} />
          <p className="muted room-hint">
            Blank stays blank — a competency you did not probe is &ldquo;not
            assessed&rdquo;, which reads differently in the debrief from a low
            score.
          </p>

          {packet.competencies.map((k) => (
            <div key={k.skill_id} className="room-comp">
              <div className="room-comp-head">
                <span className={`skill-chip${k.must_have ? " must" : ""}`}>
                  {k.name}
                </span>
                <div className="iv-scale">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`iv-dot${ratings[k.skill_id] === n ? " on" : ""}`}
                      aria-label={`${k.name}: ${n}`}
                      onClick={() =>
                        setRatings((prev) => {
                          const next = { ...prev };
                          if (next[k.skill_id] === n) delete next[k.skill_id];
                          else next[k.skill_id] = n;
                          return next;
                        })
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                rows={2}
                placeholder="What you asked, what came back…"
                value={notes[k.skill_id] ?? ""}
                onChange={(e) => setNote(k.skill_id, e.target.value)}
              />
            </div>
          ))}

          <SectionHead label="Your call" />
          <div className="row room-rec">
            {RECOMMENDATIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={recommendation === r.key ? "" : "secondary"}
                onClick={() => setRecommendation(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div style={{ width: 140 }}>
            <label>Overall (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={overall}
              onChange={(e) => setOverall(Number(e.target.value))}
            />
          </div>
          <label>Anything the competencies did not cover</label>
          <textarea
            rows={3}
            value={notes.__overall ?? ""}
            onChange={(e) => setNote("__overall", e.target.value)}
          />

          {error && <p className="error">{error}</p>}
          <button disabled={busy} onClick={file} className="room-file">
            {busy ? "Filing…" : "File scorecard"}
          </button>
          <p className="muted room-hint">
            Filing makes this visible to the panel and the recruiter. It never
            reaches the vendor — only a released feedback packet does.
          </p>
        </aside>
      </div>
    </main>
  );
}
