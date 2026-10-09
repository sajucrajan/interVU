/**
 * One way to write a date.
 *
 * The app had grown five: "10/9/2026, 3:38:10 PM" on a position,
 * "3/1/2023" on a vendor contract, "Oct 06, 2026" on a candidate,
 * "THU, OCT 8" on an interview. Every call site now goes through here, so a
 * date reads the same wherever it appears.
 *
 * The year is shown only when it is not this year. Seconds are never shown:
 * nothing in hiring happens on a timescale where they mean anything.
 *
 * Pass `utc: true` for date-only values (a contract start, an unlock date)
 * that are stored as midnight UTC, so a viewer west of Greenwich does not see
 * the day before.
 */

type In = string | number | Date;

const toDate = (d: In) => (d instanceof Date ? d : new Date(d));

function dateOpts(d: Date, utc?: boolean): Intl.DateTimeFormatOptions {
  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  return {
    month: "short",
    day: "numeric",
    ...(year !== new Date().getFullYear() ? { year: "numeric" } : {}),
    ...(utc ? { timeZone: "UTC" } : {}),
  };
}

/** "Oct 9", or "Mar 1, 2023" outside the current year. */
export function formatDate(d: In, { utc = false } = {}): string {
  const date = toDate(d);
  return date.toLocaleDateString(undefined, dateOpts(date, utc));
}

/** "Oct 9, 3:38 PM". */
export function formatDateTime(d: In): string {
  const date = toDate(d);
  return date.toLocaleString(undefined, {
    ...dateOpts(date),
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "3:38 PM". */
export function formatTime(d: In): string {
  return toDate(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/**
 * "today", "yesterday", "in 3 days", "2 weeks ago". Day granularity: this is
 * for release dates and deadlines, not for "how long ago did this happen",
 * which the age pills already answer in hours.
 */
export function formatRelativeDay(d: In): string {
  const date = toDate(d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(new Date())) / 86_400_000);
  if (Math.abs(days) < 14) return rtf.format(days, "day");
  if (Math.abs(days) < 60) return rtf.format(Math.round(days / 7), "week");
  return formatDate(date);
}
