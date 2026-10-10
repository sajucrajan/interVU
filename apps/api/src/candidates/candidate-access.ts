/**
 * Who may open a candidate, and which scorecards they may read once in.
 * Pure, so the rules are tested without a database (candidate-access.test.ts).
 * Authority: docs/09 §4.1 and §4.2, docs/01 §2.3.
 */

export interface ApplicationFacts {
  id: string;
  /** The position's org unit: what tree-scoped history access is checked against. */
  orgUnitId: string;
  /** A decision closes the interviewer's window on the candidate. */
  decided: boolean;
  /** Everyone on any interview panel for this application. */
  panelistIds: readonly string[];
}

/**
 * - `history`: candidates.view_history on ANY of the candidate's applications
 *   inside the viewer's scope unlocks the whole timeline (§4.1).
 * - `panel`: the viewer sits on a panel for one of the candidate's
 *   applications that has not been decided yet. Assignment IS the grant
 *   (§4.2) — an interviewer holds no tree scope at all, and used to be
 *   refused the person they were about to interview. `panelistId` is null
 *   when the viewer is acting as a role persona (§7): seats then count for
 *   nothing, however many they hold.
 * - `null`: neither; the caller refuses.
 */
export type CandidateGrant = "history" | "panel" | null;

export function candidateGrant(
  applications: readonly ApplicationFacts[],
  historyScope: "org" | readonly string[],
  panelistId: string | null,
): CandidateGrant {
  if (historyScope === "org") return "history";
  if (applications.some((a) => historyScope.includes(a.orgUnitId))) return "history";
  if (
    panelistId !== null &&
    applications.some((a) => !a.decided && a.panelistIds.includes(panelistId))
  ) {
    return "panel";
  }
  return null;
}

/**
 * May the viewer read the scorecards of ONE application? Tree-scoped history
 * on that application's unit, or a seat on one of its panels. A panelist keeps
 * this after the decision: it is their own debrief, not the candidate's file.
 */
export function canReadScorecards(
  application: ApplicationFacts,
  historyScope: "org" | readonly string[],
  panelistId: string | null,
): boolean {
  if (historyScope === "org" || historyScope.includes(application.orgUnitId)) return true;
  return panelistId !== null && application.panelistIds.includes(panelistId);
}

/**
 * Feedback-visibility (docs/01 §2.3). Under `hidden_until_submitted` a
 * panelist who has not filed for an application sees only their own scorecard
 * on it; everyone else sees all of them. Applied per application, so filing
 * for one loop never unseals another.
 */
export function visibleScorecards<T extends { orgUserId: string; applicationId: string }>(
  scorecards: readonly T[],
  panelistsByApplication: ReadonlyMap<string, readonly string[]>,
  viewerId: string,
  policy: "open" | "hidden_until_submitted",
): T[] {
  if (policy === "open") return [...scorecards];
  const filedFor = new Set(
    scorecards.filter((s) => s.orgUserId === viewerId).map((s) => s.applicationId),
  );
  return scorecards.filter((s) => {
    if (s.orgUserId === viewerId) return true;
    const onPanel = panelistsByApplication.get(s.applicationId)?.includes(viewerId) ?? false;
    return !onPanel || filedFor.has(s.applicationId);
  });
}
