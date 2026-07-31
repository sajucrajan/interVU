"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiErrorMessage } from "@/lib/api";

interface MyInterview {
  id: string;
  round_name: string;
  scheduled_at: string;
  status: string;
  candidate: { id: string; displayName: string };
  position_title: string;
  my_scorecard_submitted: boolean;
}

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

  return (
    <main className="wide">
      <div className="row spread">
        <h1>My interviews</h1>
        <a href="/dashboard">Dashboard</a>
      </div>
      {interviews.length === 0 && <p className="muted">No interviews assigned.</p>}
      {interviews.map((i) => (
        <div className="card" key={i.id}>
          <div className="row spread">
            <div>
              <strong>{i.candidate.displayName}</strong>{" "}
              <span className="muted">
                · {i.round_name} · {i.position_title} ·{" "}
                {new Date(i.scheduled_at).toLocaleString()}
              </span>{" "}
              <a href={`/candidates/${i.candidate.id}`}>history</a>
            </div>
            {i.my_scorecard_submitted ? (
              <span className="badge ok">scorecard submitted</span>
            ) : (
              <button onClick={() => setScoring(scoring === i.id ? null : i.id)}>
                {scoring === i.id ? "Close" : "Submit scorecard"}
              </button>
            )}
          </div>
          {scoring === i.id && (
            <ScorecardForm
              interviewId={i.id}
              onDone={() => {
                setScoring(null);
                void refresh();
              }}
            />
          )}
        </div>
      ))}
    </main>
  );
}

function ScorecardForm({ interviewId, onDone }: { interviewId: string; onDone: () => void }) {
  const [rating, setRating] = useState(3);
  const [recommendation, setRecommendation] = useState("yes");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/interviews/${interviewId}/scorecards`, {
        method: "POST",
        body: { overall_rating: rating, recommendation, notes },
      });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: "0.75rem" }}>
      <div className="row">
        <div>
          <label>Overall rating (1–5)</label>
          <input
            type="number"
            min={1}
            max={5}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </div>
        <div>
          <label>Recommendation</label>
          <select value={recommendation} onChange={(e) => setRecommendation(e.target.value)}>
            <option value="strong_yes">Strong yes</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
            <option value="strong_no">Strong no</option>
          </select>
        </div>
      </div>
      <label>Notes</label>
      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div style={{ marginTop: "0.75rem" }}>
        <button disabled={busy}>{busy ? "Submitting…" : "Submit scorecard"}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
