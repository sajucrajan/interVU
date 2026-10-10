import { describe, expect, it } from "vitest";
import {
  type ApplicationFacts,
  canReadScorecards,
  candidateGrant,
  visibleScorecards,
} from "./candidate-access";

/**
 * Who may open a candidate.
 *
 * The case that was broken: an interviewer holds no tree scope at all, so the
 * history check alone refused every candidate they were on a panel for —
 * "You don't have access to this candidate's history" one click after being
 * told to go and interview them.
 */
const app = (over: Partial<ApplicationFacts> = {}): ApplicationFacts => ({
  id: "app-1",
  orgUnitId: "team-platform",
  decided: false,
  panelistIds: [],
  ...over,
});

describe("candidateGrant", () => {
  it("grants history org-wide", () => {
    expect(candidateGrant([app()], "org", "u")).toBe("history");
  });

  it("grants history when ANY application is in scope (docs/09 §4.1)", () => {
    const apps = [app({ orgUnitId: "team-gtm" }), app({ id: "app-2" })];
    expect(candidateGrant(apps, ["team-platform"], "u")).toBe("history");
  });

  it("grants a panelist with no scope at all — the regression", () => {
    expect(candidateGrant([app({ panelistIds: ["indira"] })], [], "indira")).toBe("panel");
  });

  it("closes the panelist's window once a decision is recorded (§4.2)", () => {
    const decided = app({ panelistIds: ["indira"], decided: true });
    expect(candidateGrant([decided], [], "indira")).toBeNull();
  });

  it("ignores panel seats while acting as a role persona (docs/09 §7)", () => {
    expect(candidateGrant([app({ panelistIds: ["indira"] })], [], null)).toBeNull();
    expect(canReadScorecards(app({ panelistIds: ["indira"] }), [], null)).toBe(false);
  });

  it("refuses a read-only role that is neither in scope nor on a panel", () => {
    expect(candidateGrant([app({ panelistIds: ["indira"] })], ["team-gtm"], "parker")).toBeNull();
    expect(candidateGrant([app()], [], "parker")).toBeNull();
  });
});

describe("canReadScorecards", () => {
  it("lets a panelist read their own debrief, even after the decision", () => {
    expect(canReadScorecards(app({ panelistIds: ["indira"], decided: true }), [], "indira")).toBe(true);
  });

  it("refuses an org member who is neither in scope nor on the panel", () => {
    // This endpoint used to have no check at all.
    expect(canReadScorecards(app(), [], "sasha")).toBe(false);
    expect(canReadScorecards(app(), ["team-gtm"], "parker")).toBe(false);
  });

  it("allows history in the application's own unit", () => {
    expect(canReadScorecards(app(), ["team-platform"], "harper")).toBe(true);
  });
});

describe("visibleScorecards (hidden_until_submitted)", () => {
  const cards = [
    { orgUserId: "indira", applicationId: "a" },
    { orgUserId: "ivan", applicationId: "a" },
    { orgUserId: "ivan", applicationId: "b" },
  ];
  const panels = new Map([
    ["a", ["indira", "ivan"]],
    ["b", ["indira", "ivan"]],
  ]);

  it("shows a panelist who has filed everyone's card on that application", () => {
    const seen = visibleScorecards(cards, panels, "indira", "hidden_until_submitted");
    expect(seen.filter((s) => s.applicationId === "a")).toHaveLength(2);
  });

  it("keeps another loop sealed until they file for it too", () => {
    const seen = visibleScorecards(cards, panels, "indira", "hidden_until_submitted");
    expect(seen.filter((s) => s.applicationId === "b")).toHaveLength(0);
  });

  it("does not seal anything for a viewer who is not on the panel", () => {
    expect(visibleScorecards(cards, panels, "harper", "hidden_until_submitted")).toHaveLength(3);
  });

  it("shows everything under the open policy", () => {
    expect(visibleScorecards(cards, panels, "indira", "open")).toHaveLength(3);
  });
});
