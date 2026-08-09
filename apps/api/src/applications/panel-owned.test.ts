import { describe, expect, it } from "vitest";
import { PANEL_STAGES, panelOwned } from "./panel-owned";

/**
 * Who may record a rejection.
 *
 * This exists because the rule was wrong in a way nothing caught: it asked
 * whether an interview ROW existed, and rows are created when a time is
 * agreed — not when the card enters the lane. Every application in the
 * interviewing and offer stages had zero rows, so a recruiter could
 * unilaterally reject a candidate the board showed as mid-loop.
 *
 * The stage cases below are the ones that were broken. They are the point.
 */
describe("panelOwned", () => {
  it("is false before a loop starts, so a recruiter can finish their own screening", () => {
    expect(panelOwned("submitted", 0)).toBe(false);
    expect(panelOwned("screening", 0)).toBe(false);
  });

  it("is true in the interviewing lane even with no interview scheduled yet", () => {
    // The regression. A card is dragged across long before a time is agreed.
    expect(panelOwned("interviewing", 0)).toBe(true);
  });

  it("is true at offer and hired, where a decision already stands", () => {
    expect(panelOwned("offer", 0)).toBe(true);
    expect(panelOwned("hired", 0)).toBe(true);
  });

  it("is true once anyone has been interviewed, whatever the stage says", () => {
    // Stage can lag reality — someone interviews before the card is moved.
    expect(panelOwned("screening", 1)).toBe(true);
    expect(panelOwned("submitted", 2)).toBe(true);
  });

  it("covers every stage at or past interviewing", () => {
    // A new stage between interviewing and hired must be considered here
    // rather than silently defaulting to recruiter-rejectable.
    expect(PANEL_STAGES).toEqual(["interviewing", "offer", "hired"]);
  });
});
