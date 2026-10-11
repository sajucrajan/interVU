/**
 * The one rule a ways-of-working rating must satisfy before it is stored
 * (docs/01 §4, Ways of working): a 1 or a 5 carries a note. The ends of the scale are the
 * ratings that swing a debrief, and a bare number there is an opinion. Pure,
 * so the room, the quick-file form and the server apply the same test.
 */
export const EVIDENCE_REQUIRED_AT = new Set([1, 5]);

export interface AttributeRating {
  attribute_id: string;
  rating: number | null;
  note?: string | null;
}

/** The first rating that needs a note and has none, or null when all is well. */
export function bareExtreme<T extends AttributeRating>(ratings: T[]): T | null {
  return (
    ratings.find(
      (r) => r.rating !== null && EVIDENCE_REQUIRED_AT.has(r.rating) && !r.note?.trim(),
    ) ?? null
  );
}
