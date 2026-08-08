"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface Tally {
  score: number;
  up: number;
  down: number;
  my_vote: number;
}

/**
 * Thumbs on a bank question.
 *
 * Shown next to, never instead of, the usage spread: a vote says whether
 * interviewers think a question is worth asking, spread says whether it
 * actually separates candidates. Those disagree often enough to be worth
 * seeing side by side.
 *
 * Clicking your current vote withdraws it, so there is a way back to "no
 * opinion" — otherwise a mis-click is permanent and the tally drifts.
 */
export function VoteButtons({
  questionId,
  initial,
  compact,
}: {
  questionId: string;
  initial: Tally;
  compact?: boolean;
}) {
  const [tally, setTally] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function cast(value: number) {
    const next = tally.my_vote === value ? 0 : value;
    setBusy(true);
    setFailed(false);
    try {
      setTally(
        await api<Tally>(`/questions/${questionId}/vote`, {
          method: "PUT",
          body: { value: next },
        }),
      );
    } catch {
      // Keep the previous tally rather than inventing one, but SAY that it
      // did not land. Swallowing this silently made a failed vote and a
      // withdrawn vote look identical — both just "nothing happened".
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`vote${compact ? " compact" : ""}`}>
      <button
        type="button"
        disabled={busy}
        aria-pressed={tally.my_vote > 0}
        aria-label="Good question"
        title={
          tally.my_vote > 0
            ? "You marked this worth asking — click to withdraw"
            : `${tally.up} found this worth asking`
        }
        className={`vote-btn${tally.my_vote > 0 ? " on up" : ""}`}
        onClick={() => cast(1)}
      >
        ▲
      </button>
      <span
        className={`vote-score${failed ? " failed" : ""}`}
        title={
          failed
            ? "That vote did not save — try again"
            : `${tally.up} up · ${tally.down} down`
        }
      >
        {failed ? "!" : tally.score > 0 ? `+${tally.score}` : tally.score}
      </span>
      <button
        type="button"
        disabled={busy}
        aria-pressed={tally.my_vote < 0}
        aria-label="Not worth asking"
        title={
          tally.my_vote < 0
            ? "You marked this not worth asking — click to withdraw"
            : `${tally.down} would not ask it`
        }
        className={`vote-btn${tally.my_vote < 0 ? " on down" : ""}`}
        onClick={() => cast(-1)}
      >
        ▼
      </button>
    </div>
  );
}
