"use client";

import { useState } from "react";

/**
 * The organization's ways of working (docs/01 §4, Ways of working), rated on every scorecard
 * next to the role's skills. One component so the interview room and the
 * quick-file form ask the same questions the same way.
 *
 * Same rules as competencies: nothing pre-selected, blank is "not assessed",
 * tap the same number again to clear. One extra rule: a 1 or a 5 needs a
 * note on what was seen. The server refuses one without, so the form says so
 * before it tries.
 */
export interface Attribute {
  attribute_id: string;
  name: string;
  description: string;
  behaviours: string[];
}

/** 1 or 5: the ratings that swing a debrief, so they carry evidence. */
export const needsEvidence = (rating: number | undefined) => rating === 1 || rating === 5;

/** The first attribute rated 1 or 5 without a note, or null. */
export function missingEvidence(
  attributes: Attribute[],
  ratings: Record<string, number>,
  notes: Record<string, string>,
): Attribute | null {
  return (
    attributes.find(
      (a) => needsEvidence(ratings[a.attribute_id]) && !(notes[a.attribute_id] ?? "").trim(),
    ) ?? null
  );
}

/** The request body rows, from the form's state. */
export function attributesPayload(
  ratings: Record<string, number>,
  notes: Record<string, string>,
) {
  return Object.entries(ratings).map(([attribute_id, rating]) => ({
    attribute_id,
    rating,
    note: notes[attribute_id]?.trim() || undefined,
  }));
}

export function AttributeRatings({
  attributes,
  ratings,
  notes,
  onRate,
  onNote,
  compact,
}: {
  attributes: Attribute[];
  ratings: Record<string, number>;
  notes: Record<string, string>;
  onRate: (id: string, rating: number | null) => void;
  onNote: (id: string, note: string) => void;
  /** The quick-file form: no note box until one is needed. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (attributes.length === 0) return null;
  return (
    <div className="attr-list">
      {attributes.map((a) => {
        const rating = ratings[a.attribute_id];
        const needs = needsEvidence(rating);
        const note = notes[a.attribute_id] ?? "";
        const showNote = !compact || needs || note.length > 0;
        return (
          <div key={a.attribute_id} className="attr-row">
            <div className="attr-head">
              <div className="attr-name">
                <button
                  type="button"
                  className="attr-what"
                  aria-expanded={open === a.attribute_id}
                  onClick={() => setOpen(open === a.attribute_id ? null : a.attribute_id)}
                  title="What strong looks like"
                >
                  {a.name}
                  <span className="attr-caret" aria-hidden>
                    {open === a.attribute_id ? "▾" : "▸"}
                  </span>
                </button>
                {a.description && <span className="muted attr-desc">{a.description}</span>}
              </div>
              <div className="iv-scale">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`iv-dot${rating === n ? " on" : ""}`}
                    aria-label={`${a.name}: ${n}`}
                    onClick={() => onRate(a.attribute_id, rating === n ? null : n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {open === a.attribute_id && a.behaviours.length > 0 && (
              <ul className="attr-behaviours">
                {a.behaviours.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {showNote && (
              <textarea
                rows={2}
                className={needs && !note.trim() ? "attr-needs" : ""}
                placeholder={
                  needs
                    ? `A ${rating} needs evidence: what did you see?`
                    : "What you saw that shows this…"
                }
                value={note}
                onChange={(e) => onNote(a.attribute_id, e.target.value)}
              />
            )}
            {needs && !note.trim() && (
              <p className="attr-warn">
                A {rating} on {a.name} is filed only with a note on what you saw.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
