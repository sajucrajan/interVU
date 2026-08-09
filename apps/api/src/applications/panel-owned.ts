/**
 * Has a panel taken this application over?
 *
 * The question decides who may record a rejection: before a loop starts a
 * recruiter is finishing their own screening work, and after it starts the
 * outcome belongs to the people who sat in the room.
 *
 * One definition, in one file, because the API gate and the screening screen
 * both ask it. When they disagree the UI offers a button the API refuses, and
 * the user is told "forbidden" for an action the same page just invited.
 */

/**
 * Stages at or past the point a loop owns the outcome.
 *
 * Stage counts on its own — an interview ROW appears only when a time is
 * agreed, which can be days after the card moves. Keying on the row alone
 * left every application in these stages unprotected.
 */
export const PANEL_STAGES = ["interviewing", "offer", "hired"];

export function panelOwned(stage: string, interviewCount: number): boolean {
  return PANEL_STAGES.includes(stage) || interviewCount > 0;
}
