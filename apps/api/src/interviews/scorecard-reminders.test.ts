import { describe, expect, it } from "vitest";
import { reminderDue, reminderEmail } from "./scorecard-reminders";

/**
 * When a panelist is reminded. The cases that matter are the edges: nothing
 * before the interview has ended, exactly one reminder per stage, and no
 * catch-up burst for interviews that ended long before the feature shipped.
 */
const H = 3_600_000;
const end = new Date("2026-10-10T10:00:00Z");
const at = (hoursAfterEnd: number) => new Date(end.getTime() + hoursAfterEnd * H);
const due = (hoursAfterEnd: number, freshSent = false, overdueSent = false) =>
  reminderDue({ endsAt: end, now: at(hoursAfterEnd), dueHours: 24, freshSent, overdueSent });

describe("reminderDue", () => {
  it("sends nothing before the interview has ended, or in its first hour", () => {
    expect(due(-2)).toBeNull();
    expect(due(0.5)).toBeNull();
  });

  it("sends the fresh reminder an hour after the end, once", () => {
    expect(due(1)).toBe("fresh");
    expect(due(5, true)).toBeNull();
  });

  it("sends the overdue reminder at the due line, once", () => {
    expect(due(24, true)).toBe("overdue");
    expect(due(30, true, true)).toBeNull();
  });

  it("skips straight to overdue when the fresh one was missed", () => {
    expect(due(26)).toBe("overdue");
  });

  it("follows the organization's own threshold", () => {
    expect(reminderDue({ endsAt: end, now: at(10), dueHours: 8, freshSent: true, overdueSent: false })).toBe("overdue");
  });

  it("leaves interviews older than a week alone", () => {
    expect(due(8 * 24)).toBeNull();
  });
});

describe("reminderEmail", () => {
  const base = {
    name: "Indira",
    candidate: "Padma Menon",
    round: "Technical round",
    position: "POS-004 Frontend Engineer",
    dueHours: 24,
    link: "https://example.test/interviews/1/room",
  };

  it("says how much of the panel is waiting, and links to the room", () => {
    const m = reminderEmail({ ...base, kind: "fresh", panelSize: 3, panelFiled: 1 });
    expect(m.text).toContain("1 of the other 2 panelists have filed");
    expect(m.text).toContain(base.link);
  });

  it("marks the overdue one as the last", () => {
    const m = reminderEmail({ ...base, kind: "overdue", panelSize: 1, panelFiled: 0 });
    expect(m.subject).toMatch(/^Overdue scorecard/);
    expect(m.text).toContain("only panelist");
    expect(m.text).toContain("last reminder");
  });
});
