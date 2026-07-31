import { describe, expect, it } from "vitest";
import { jaroWinkler } from "./similarity/jaro-winkler.js";
import { normalizeName } from "./normalize/name.js";
import { scorePair, T_AUTO, T_REVIEW } from "./score.js";

describe("jaroWinkler", () => {
  it("is 1 for identical and 0 for disjoint strings", () => {
    expect(jaroWinkler("martha", "martha")).toBe(1);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });

  it("scores classic near-matches high", () => {
    expect(jaroWinkler("martha", "marhta")).toBeGreaterThan(0.94);
    expect(jaroWinkler("dwayne", "duane")).toBeGreaterThan(0.8);
  });
});

describe("normalizeName", () => {
  it("token-sorts, casefolds, strips honorifics and suffixes", () => {
    expect(normalizeName("Dr. Smith, John Jr")).toBe("john smith");
    expect(normalizeName("john SMITH")).toBe("john smith");
    expect(normalizeName("Smith John")).toBe(normalizeName("John Smith"));
  });
});

describe("scorePair", () => {
  const jon = {
    name: "Jon Smith",
    emailLocal: "jon.smith",
    employer: "Initech",
    title: "Platform Engineer",
    location: "Austin",
  };

  it("probable same person with partial evidence → review band, not auto", () => {
    const { score } = scorePair(jon, {
      name: "John Smith",
      emailLocal: "jsmith88",
      employer: "Initech",
      title: "SRE", // different title, no location — corroboration is partial
    });
    expect(score).toBeGreaterThanOrEqual(T_REVIEW);
    expect(score).toBeLessThan(T_AUTO);
  });

  it("full corroboration on all five features → auto band (docs/04 §2.4)", () => {
    const { score } = scorePair(jon, {
      name: "John Smith",
      emailLocal: "jsmith88",
      employer: "Initech",
      title: "Platform Engineer",
      location: "Austin",
    });
    expect(score).toBeGreaterThanOrEqual(T_AUTO);
  });

  it("near-identical evidence on every feature → auto band", () => {
    const { score } = scorePair(jon, {
      name: "Jon Smyth",
      emailLocal: "jon.smith",
      employer: "Initech",
      title: "Platform Engineer",
      location: "Austin",
    });
    expect(score).toBeGreaterThanOrEqual(T_AUTO);
  });

  it("GUARD: identical common name + location alone can never auto-link", () => {
    const { score } = scorePair(
      { name: "Maria Garcia", location: "Madrid" },
      { name: "Maria Garcia", location: "Madrid" },
    );
    expect(score).toBeLessThan(T_REVIEW); // 0.55 max by construction
  });

  it("different people at the same employer stay below review band", () => {
    const { score } = scorePair(jon, {
      name: "Priya Nair",
      emailLocal: "priya.nair",
      employer: "Initech",
      title: "Data Engineer",
      location: "Austin",
    });
    expect(score).toBeLessThan(T_REVIEW);
  });

  it("missing features contribute zero, not similarity", () => {
    const { breakdown } = scorePair({ name: "A B" }, { name: "A B" });
    expect(breakdown.email_local).toBe(0);
    expect(breakdown.employer).toBe(0);
  });
});
