import { describe, expect, it } from "vitest";
import { scorePair, T_AUTO, T_REVIEW, type CandidateFeatures } from "./score.js";

/**
 * Synthetic labeled corpus (docs/04 §6): deterministic generated pairs.
 * CI gates: precision@auto-link must be 1.0 — a false auto-merge leaks one
 * person's history into another's packet, the engine's worst failure mode.
 */

const people: CandidateFeatures[] = [
  { name: "Aarav Sharma", emailLocal: "aarav.sharma", employer: "Initech", title: "Backend Engineer", location: "Pune" },
  { name: "Beatriz Costa", emailLocal: "bcosta", employer: "Globex", title: "Data Engineer", location: "Lisbon" },
  { name: "Chen Wei", emailLocal: "chen.wei", employer: "Hooli", title: "SRE", location: "Singapore" },
  { name: "Divya Iyer", emailLocal: "divya.iyer", employer: "Initech", title: "ML Engineer", location: "Bengaluru" },
  { name: "Emeka Okafor", emailLocal: "emeka.o", employer: "Umbrella", title: "Platform Engineer", location: "Lagos" },
  { name: "Fatima Hassan", emailLocal: "fhassan", employer: "Globex", title: "Frontend Engineer", location: "Dubai" },
  { name: "Gustav Lind", emailLocal: "gustav.lind", employer: "Aperture", title: "Staff Engineer", location: "Stockholm" },
  { name: "Hana Kato", emailLocal: "hana.kato", employer: "Hooli", title: "Data Scientist", location: "Osaka" },
  { name: "Maria Garcia", emailLocal: "maria.garcia", employer: "Initech", title: "QA Engineer", location: "Madrid" },
  { name: "Maria Garcia", emailLocal: "mgarcia.dev", employer: "Globex", title: "Backend Engineer", location: "Madrid" }, // distinct person, same common name+city
];

/** Same-person variants: what vendors actually do to profiles. */
function variants(p: CandidateFeatures): CandidateFeatures[] {
  const [first = "", last = ""] = p.name.split(" ");
  return [
    { ...p, name: `${first} ${last.slice(0, -1)}${last.slice(-1) === "a" ? "ah" : "e"}` }, // misspelled surname
    { ...p, name: `${first.toUpperCase()} ${last.toLowerCase()}`, emailLocal: `${p.emailLocal}1` },
    { ...p, name: `${last} ${first}` }, // token order flip
    { ...p, emailLocal: `${first.toLowerCase()}.${last.toLowerCase()}.work`, title: p.title },
    { ...p, name: `${first} ${last}`, title: undefined, location: undefined }, // sparse resubmission
  ];
}

describe("matching eval corpus", () => {
  const positives: number[] = [];
  const negatives: number[] = [];

  for (const p of people) {
    for (const v of variants(p)) positives.push(scorePair(p, v).score);
  }
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      negatives.push(scorePair(people[i]!, people[j]!).score);
    }
  }

  it("precision@auto-link is 1.0 — NO negative pair ever auto-links", () => {
    const falseAuto = negatives.filter((s) => s >= T_AUTO);
    expect(falseAuto).toEqual([]);
  });

  it("distinct people rarely even reach the review queue (< 10%)", () => {
    const queued = negatives.filter((s) => s >= T_REVIEW);
    expect(queued.length / negatives.length).toBeLessThan(0.1);
  });

  it("recall@review: ≥ 80% of true variants reach at least the review queue", () => {
    const caught = positives.filter((s) => s >= T_REVIEW);
    expect(caught.length / positives.length).toBeGreaterThanOrEqual(0.8);
  });

  it("the same-name-same-city distinct pair lands below auto (structural guard)", () => {
    const { score } = scorePair(people[8]!, people[9]!);
    expect(score).toBeLessThan(T_AUTO);
  });
});
