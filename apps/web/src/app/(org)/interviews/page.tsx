"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";
import { SectionHead } from "@/components/section-head";

interface Competency {
  skill_id: string;
  name: string;
  must_have: boolean;
}

interface MyInterview {
  id: string;
  round_name: string;
  scheduled_at: string;
  ends_at: string;
  duration_min: number;
  location_or_link: string | null;
  status: string;
  candidate: { id: string; displayName: string };
  position_title: string;
  position_reference: string | null;
  application_id: string;
  my_scorecard_submitted: boolean;
  competencies: Competency[];
  panel_size: number;
  panel_filed: number;
  hours_since_end: number | null;
}

const RECOMMENDATIONS = [
  { key: "strong_yes", label: "Strong yes" },
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
  { key: "strong_no", label: "Strong no" },
];

/** Same 24h line the debrief's turnaround column is read against. */
const TURNAROUND_SLA = 24;

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const overdueLabel = (h: number) =>
  h < 1 ? "just finished" : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;

/**
 * The interviewer's own screen.
 *
 * Panel membership IS the grant (docs/09 §4.2), so this is the one workspace
 * page that shows work outside the viewer's org-unit scope. It is grouped by
 * what the viewer must DO rather than by date: an interview you owe a
 * scorecard for is blocking a whole panel's debrief, and burying it under
 * next week's calendar is how it stays unfiled.
 */
export default function MyInterviewsPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<MyInterview[] | null>(null);
  const [scoring, setScoring] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      api<MyInterview[]>("/interviews/mine")
        .then(setInterviews)
        .catch(() => router.push("/login")),
    [router],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!interviews) return <main className="wide muted">Loading…</main>;

  // The three groups must partition the list, not overlap: filing early for
  // an interview still in the future is legitimate, and such a row belongs
  // under Filed only — showing it again under Upcoming reads as two
  // assignments where there is one.
  const now = Date.now();
  const done = interviews.filter((i) => i.my_scorecard_submitted);
  const pending = interviews.filter((i) => !i.my_scorecard_submitted);
  const owed = pending.filter((i) => new Date(i.ends_at).getTime() <= now);
  const upcoming = pending
    .filter((i) => new Date(i.ends_at).getTime() > now)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  const late = owed.filter(
    (i) => (i.hours_since_end ?? 0) > TURNAROUND_SLA,
  ).length;

  return (
    <main className="wide">
      <header className="page-head">
        <div>
          <div className="mono-label">Panel assignments · your scope</div>
          <h1 style={{ marginTop: 12 }}>My interviews</h1>
          <p className="dossier-meta" style={{ maxWidth: "62ch" }}>
            {owed.length === 0
              ? "Nothing waiting on you."
              : `${owed.length} scorecard${owed.length === 1 ? "" : "s"} outstanding${
                  late > 0 ? `, ${late} past ${TURNAROUND_SLA}h` : ""
                }. A debrief stays sealed until every panelist has filed.`}
          </p>
        </div>
      </header>

      {owed.length > 0 && (
        <>
          <SectionHead label={`Waiting on you (${owed.length})`} />
          {owed.map((i) => (
            <InterviewRow
              key={i.id}
              interview={i}
              open={scoring === i.id}
              onToggle={() => setScoring(scoring === i.id ? null : i.id)}
              onDone={() => {
                setScoring(null);
                void refresh();
              }}
            />
          ))}
        </>
      )}

      {upcoming.length > 0 && (
        <>
          <SectionHead label={`Upcoming (${upcoming.length})`} />
          {upcoming.map((i) => (
            <InterviewRow key={i.id} interview={i} open={false} onToggle={null} />
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <SectionHead label={`Filed (${done.length})`} />
          {done.map((i) => (
            <InterviewRow key={i.id} interview={i} open={false} onToggle={null} />
          ))}
        </>
      )}

      {interviews.length === 0 && (
        <p className="muted">No interviews assigned to you.</p>
      )}
    </main>
  );
}

function InterviewRow({
  interview: i,
  open,
  onToggle,
  onDone,
}: {
  interview: MyInterview;
  open: boolean;
  onToggle: (() => void) | null;
  onDone?: () => void;
}) {
  const overdue = (i.hours_since_end ?? 0) > TURNAROUND_SLA;

  return (
    <div className="iv-row">
      <div className="iv-head">
        <div className="iv-who">
          <Link href={`/candidates/${i.candidate.id}`} className="iv-name">
            {i.candidate.displayName}
          </Link>
          <div className="iv-meta">
            {i.position_reference && (
              <span className="ref-code">{i.position_reference}</span>
            )}{" "}
            {i.position_title} · {i.round_name}
          </div>
          <div className="mono-label iv-when">
            {when(i.scheduled_at)} · {i.duration_min}m
            {i.location_or_link ? ` · ${i.location_or_link}` : ""}
          </div>
        </div>

        <div className="iv-state">
          {i.my_scorecard_submitted ? (
            <span className="badge ok">filed</span>
          ) : i.hours_since_end !== null ? (
            <span className={`badge ${overdue ? "bad" : "warn"}`}>
              {overdueLabel(i.hours_since_end)}
            </span>
          ) : (
            <span className="badge">scheduled</span>
          )}
          {/* Filing STATE only — never a colleague's rating. */}
          <span className="mono-label">
            panel {i.panel_filed}/{i.panel_size} filed
          </span>
          {onToggle && (
            <>
              <Link href={`/interviews/${i.id}/room`} className="room-open">
                Open room
              </Link>
              <button type="button" className="secondary" onClick={onToggle}>
                {open ? "Close" : "Quick file"}
              </button>
            </>
          )}
        </div>
      </div>

      {open && onDone && (
        <ScorecardForm
          interviewId={i.id}
          competencies={i.competencies}
          onDone={onDone}
        />
      )}
    </div>
  );
}

function ScorecardForm({
  interviewId,
  competencies,
  onDone,
}: {
  interviewId: string;
  competencies: Competency[];
  onDone: () => void;
}) {
  const [rating, setRating] = useState(3);
  const [recommendation, setRecommendation] = useState("yes");
  const [notes, setNotes] = useState("");
  // Blank stays blank. A competency you did not probe is "not assessed",
  // which the debrief renders differently from a low score — defaulting these
  // to 3 would manufacture agreement nobody expressed.
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/interviews/${interviewId}/scorecards`, {
        method: "POST",
        body: {
          overall_rating: rating,
          recommendation,
          notes,
          competencies: Object.entries(ratings).map(([skill_id, r]) => ({
            skill_id,
            rating: r,
          })),
        },
      });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const assessed = Object.keys(ratings).length;

  return (
    <form onSubmit={submit} className="iv-form">
      {competencies.length > 0 && (
        <>
          <SectionHead label="Competencies" />
          <p className="muted iv-hint">
            Rate only what your round actually probed — {assessed} of{" "}
            {competencies.length} rated. Anything left blank is recorded as
            &ldquo;not assessed&rdquo;, which reads differently in the debrief
            from a low score.
          </p>
          <div className="iv-matrix">
            {competencies.map((c) => (
              <div key={c.skill_id} className="iv-comp">
                <span className={`skill-chip${c.must_have ? " must" : ""}`}>
                  {c.name}
                </span>
                <div className="iv-scale">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`iv-dot${ratings[c.skill_id] === n ? " on" : ""}`}
                      aria-label={`${c.name}: ${n}`}
                      onClick={() =>
                        setRatings((prev) => {
                          const next = { ...prev };
                          // Clicking the same value again clears it — the only
                          // way back to "not assessed" once you have tapped.
                          if (next[c.skill_id] === n) delete next[c.skill_id];
                          else next[c.skill_id] = n;
                          return next;
                        })
                      }
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionHead label="Your call" />
      <div className="row" style={{ gap: 8, marginBottom: "var(--step-3)" }}>
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

      <div className="row">
        <div style={{ width: 140 }}>
          <label>Overall (1–5)</label>
          <input
            type="number"
            min={1}
            max={5}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
          />
        </div>
      </div>

      <label>Notes</label>
      <textarea
        rows={4}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What you saw, and what would change your mind."
      />

      <p className="muted iv-hint">
        Once filed, this is visible to the panel and to the recruiter. It never
        reaches the vendor — only the released feedback packet does.
      </p>
      <div>
        <button disabled={busy}>{busy ? "Submitting…" : "Submit scorecard"}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
