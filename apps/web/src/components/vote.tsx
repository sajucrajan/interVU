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
 * The thumbs SET your vote rather than toggling it: pressing ▲ when you have
 * already upvoted leaves you upvoted, and pressing ▼ changes your mind. An
 * explicit ✕ clears it.
 *
 * They were toggles first, and that was wrong. A second press on the thumb you
 * had already chosen silently withdrew the vote — so the score fell and the
 * highlight vanished, which reads as "I only got one chance" rather than "you
 * just undid it". Withdrawing is a rarer intent than changing your mind, and
 * it should not share a control with the common one.
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

  async function cast(next: number) {
    // Idempotent: re-pressing your current choice is a no-op rather than a
    // silent undo.
    if (next === tally.my_vote) return;
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
            ? "You marked this worth asking"
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
            ? "You marked this not worth asking"
            : `${tally.down} would not ask it`
        }
        className={`vote-btn${tally.my_vote < 0 ? " on down" : ""}`}
        onClick={() => cast(-1)}
      >
        ▼
      </button>
      {tally.my_vote !== 0 && (
        <button
          type="button"
          disabled={busy}
          className="vote-clear"
          aria-label="Clear my vote"
          title="Clear my vote"
          onClick={() => cast(0)}
        >
          ✕
        </button>
      )}
    </div>
  );
}
