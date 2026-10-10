/**
 * When a panelist is reminded to file a scorecard. Pure, so the schedule is
 * tested without a clock or a database (scorecard-reminders.test.ts).
 *
 * Two nudges, never more:
 *   - "fresh": an hour after the interview ends, while it is still
 *     remembered. Most scorecards that go late are ones nobody started that day.
 *   - "overdue": once the organization's scorecard_due threshold has passed
 *     (24h by default), naming how many of the panel are still outstanding.
 *
 * A reminder that was missed (the API was down, or the feature shipped after
 * the interview) is not sent late in a burst: past the overdue line only the
 * overdue reminder goes, and nothing older than LOOKBACK is reminded at all.
 */

export type Reminder = "fresh" | "overdue";

/** Hours after the interview ends before the first nudge. */
export const FRESH_AFTER_HOURS = 1;
/** Interviews that ended longer ago than this are left alone. */
export const LOOKBACK_HOURS = 7 * 24;

export function reminderDue(input: {
  endsAt: Date;
  now: Date;
  /** The organization's scorecard_due threshold, in hours. */
  dueHours: number;
  freshSent: boolean;
  overdueSent: boolean;
}): Reminder | null {
  const hours = (input.now.getTime() - input.endsAt.getTime()) / 3_600_000;
  if (hours < FRESH_AFTER_HOURS || hours > LOOKBACK_HOURS) return null;
  if (hours >= input.dueHours) return input.overdueSent ? null : "overdue";
  return input.freshSent ? null : "fresh";
}

export function reminderEmail(input: {
  name: string;
  candidate: string;
  round: string;
  position: string;
  dueHours: number;
  kind: Reminder;
  panelSize: number;
  panelFiled: number;
  link: string;
}): { subject: string; text: string } {
  // The recipient has not filed, so every filed scorecard is someone else's.
  const others = input.panelSize - 1;
  const othersFiled = input.panelFiled;
  const panelLine =
    others <= 0
      ? "You are the only panelist on this round."
      : `${othersFiled} of the other ${others} panelist${others === 1 ? " has" : "s have"} filed. The debrief stays sealed until everyone has.`;
  if (input.kind === "fresh") {
    return {
      subject: `Scorecard: ${input.candidate} — ${input.round}`,
      text: `Hi ${input.name},

Your ${input.round} with ${input.candidate} (${input.position}) has finished. Please file your scorecard while it is fresh — it is due within ${input.dueHours} hours of the interview.

${panelLine}

File it here:
  ${input.link}

— InterVU`,
    };
  }
  return {
    subject: `Overdue scorecard: ${input.candidate} — ${input.round}`,
    text: `Hi ${input.name},

Your scorecard for the ${input.round} with ${input.candidate} (${input.position}) is past its ${input.dueHours}-hour due time.

${panelLine}

File it here:
  ${input.link}

This is the last reminder for this interview.

— InterVU`,
  };
}
