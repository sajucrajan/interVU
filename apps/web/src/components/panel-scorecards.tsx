"use client";

import { useEffect, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

interface Scorecard {
  id: string;
  overallRating: number;
  recommendation: string;
  notes: string | null;
  submittedAt: string;
  orgUser: { id: string; name: string };
  interview: { id: string; roundName: string };
  competencies: { rating: number | null; note: string | null; skill: { id: string; name: string } }[];
}

const REC_LABEL: Record<string, string> = {
  strong_yes: "Strong yes",
  yes: "Yes",
  no: "No",
  strong_no: "Strong no",
};
const REC_TONE: Record<string, string> = {
  strong_yes: "ok",
  yes: "ok",
  no: "bad",
  strong_no: "bad",
};

/**
 * What you filed, then what the rest of the panel filed.
 *
 * Before this an interviewer could file a scorecard and never see it again:
 * the row just said "filed", and opening the room offered a blank new draft.
 * The panel's cards come from the same endpoint the debrief uses, so the
 * feedback-visibility policy applies here unchanged — this component only
 * ever shows what the server already decided this viewer may read.
 */
export function PanelScorecards({
  applicationId,
  interviewId,
  viewerId,
  panelSize,
  panelFiled,
}: {
  applicationId: string;
  interviewId: string;
  viewerId: string | null;
  panelSize: number;
  panelFiled: number;
}) {
  const [cards, setCards] = useState<Scorecard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Scorecard[]>(`/applications/${applicationId}/scorecards`)
      .then(setCards)
      .catch((e) => setError(apiErrorMessage(e)));
  }, [applicationId]);

  if (error) return <p className="error">{error}</p>;
  if (!cards) return <p className="muted">Loading scorecards…</p>;

  const isMine = (c: Scorecard) =>
    c.interview.id === interviewId && (viewerId ? c.orgUser.id === viewerId : false);
  const mine = cards.find(isMine);
  const thisRound = cards.filter((c) => c.interview.id === interviewId && !isMine(c));
  const otherRounds = cards.filter((c) => c.interview.id !== interviewId);
  const outstanding = Math.max(0, panelSize - panelFiled);

  return (
    <div className="psc">
      <div className="mono-label psc-label">Your scorecard</div>
      {mine ? <Card card={mine} /> : <p className="muted">Not filed yet.</p>}

      <div className="mono-label psc-label">
        The rest of this round{outstanding > 0 ? ` · ${outstanding} still to file` : ""}
      </div>
      {thisRound.length > 0 ? (
        thisRound.map((c) => <Card key={c.id} card={c} showWho />)
      ) : (
        <p className="muted">
          {panelSize <= 1
            ? "You were the only panelist on this round."
            : "No one else has filed yet. Their scorecards appear here as they do."}
        </p>
      )}

      {otherRounds.length > 0 && (
        <>
          <div className="mono-label psc-label">Other rounds for this candidate</div>
          {otherRounds.map((c) => (
            <Card key={c.id} card={c} showWho showRound />
          ))}
        </>
      )}
    </div>
  );
}

function Card({
  card: c,
  showWho,
  showRound,
}: {
  card: Scorecard;
  showWho?: boolean;
  showRound?: boolean;
}) {
  const rated = c.competencies.filter((k) => k.rating !== null);
  return (
    <div className="psc-card">
      <div className="psc-head">
        <span className={`badge ${REC_TONE[c.recommendation] ?? ""}`}>
          {REC_LABEL[c.recommendation] ?? c.recommendation}
        </span>
        <span className="psc-overall">{c.overallRating}/5 overall</span>
        <span className="mono-label psc-who">
          {[showWho ? c.orgUser.name : null, showRound ? c.interview.roundName : null, formatDateTime(c.submittedAt)]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {rated.length > 0 && (
        <div className="psc-comps">
          {rated.map((k) => (
            <span key={k.skill.id} className="skill-chip" title={k.note ?? undefined}>
              {k.skill.name} {k.rating}/5
            </span>
          ))}
        </div>
      )}
      {c.notes && <p className="psc-notes">{c.notes}</p>}
    </div>
  );
}
