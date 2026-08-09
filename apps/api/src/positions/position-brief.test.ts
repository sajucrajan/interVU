import { describe, expect, it } from "vitest";
import { positionBrief, rateBand, type PositionForBrief } from "./position-brief";

/**
 * The brief is what someone outside the hiring team is shown, so what it
 * CANNOT carry matters more than what it can.
 *
 * The projection names its fields rather than filtering a record, which is
 * what makes these assertions meaningful: a column added to Position later
 * cannot appear here by default, and this test fails the day someone changes
 * that by spreading the source object in.
 */

const POSITION: PositionForBrief = {
  id: "p1",
  reference: "POS-005",
  title: "ML Engineer",
  description: "Own the ranking stack end to end.",
  openings: 2,
  status: "open",
  seniority: "senior",
  employmentType: "full_time",
  locationPolicy: "hybrid",
  locationText: "Edinburgh, 2 days",
  minTotalYears: 6,
  mustHaves: ["Right to work in the UK"],
  rateMin: 100,
  rateMax: 140,
  rateCurrency: "GBP",
  ratePeriod: "day",
  skills: [
    { level: "must_have", proficiency: "advanced", minYears: 4, skill: { name: "Python" } },
  ],
  orgUnit: { name: "Platform" },
};

/** Fields that must never reach either audience, whatever else changes. */
const FORBIDDEN = [
  "releases",
  "releasePolicy",
  "release_policy",
  "vendorOrg",
  "tier",
  "createdById",
  "created_by_id",
  "rateMin",
  "rateMax",
];

describe("position brief", () => {
  const interviewer = positionBrief(POSITION, {
    includeRate: false,
    audience: "interviewer",
  });
  const vendor = positionBrief(POSITION, { includeRate: true, audience: "vendor" });

  it("gives an interviewer the work: title, brief, matrix, must-haves", () => {
    expect(interviewer.title).toBe("ML Engineer");
    expect(interviewer.description).toContain("ranking stack");
    expect(interviewer.skills).toHaveLength(1);
    expect(interviewer.must_haves).toEqual(["Right to work in the UK"]);
    expect(interviewer.min_total_years).toBe(6);
    expect(interviewer.team).toBe("Platform");
  });

  it("withholds the rate from an interviewer", () => {
    // Not a privacy nicety: a number in front of someone about to judge a
    // candidate is an anchor they did not ask for and cannot unsee.
    expect(interviewer.rate_band).toBeNull();
    expect(interviewer.withheld).toContain("rate_band");
  });

  it("gives a vendor the rate, because they quote against it", () => {
    expect(vendor.rate_band).toBe("GBP 100–140 / day");
    expect(vendor.withheld).not.toContain("rate_band");
  });

  it("says what it withheld rather than omitting it silently", () => {
    // Otherwise a redacted brief and a role with no band set look identical,
    // and someone eventually reports the wrong bug.
    expect(interviewer.withheld).toEqual(
      expect.arrayContaining(["rate_band", "vendor_releases", "release_policy"]),
    );
  });

  it("never carries the release ladder or internal fields, for either audience", () => {
    for (const brief of [interviewer, vendor]) {
      const keys = Object.keys(brief);
      for (const forbidden of FORBIDDEN) {
        expect(keys, `${brief.audience} brief`).not.toContain(forbidden);
      }
      // Belt and braces: nothing nested carries them either.
      const serialized = JSON.stringify(brief);
      for (const forbidden of ["vendorOrg", "releasePolicy", "\"tier\""]) {
        expect(serialized, `${brief.audience} brief`).not.toContain(forbidden);
      }
    }
  });

  it("reports no band when the role never set one", () => {
    const unpaid = { ...POSITION, rateMin: null, rateMax: null };
    expect(rateBand(unpaid)).toBeNull();
    expect(positionBrief(unpaid, { includeRate: true, audience: "vendor" }).rate_band)
      .toBeNull();
  });
});
