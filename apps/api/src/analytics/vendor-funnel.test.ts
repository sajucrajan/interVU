import { describe, expect, it } from "vitest";
import { MIN_PEERS_FOR_BENCHMARK, benchmark, parseWindow, WINDOWS } from "./vendor-funnel";
import type { VendorFunnel } from "./vendor-funnel";

/**
 * The benchmark is the part that can hurt someone.
 *
 * Everything else here is arithmetic on the client's own data. The benchmark
 * shows one agency a number derived from its competitors', and with few
 * enough vendors "the average of the others" is one subtraction away from a
 * named rival's conversion rate. These tests pin the suppression rule,
 * because it is the kind of guard that gets relaxed by someone fixing an
 * empty-looking panel on a demo database.
 */

function vendorWith(id: string, n: {
  submitted: number;
  accepted: number;
  interviewed: number;
  offered: number;
}): VendorFunnel {
  return {
    vendor_org_id: id,
    vendor: id,
    tier: 1,
    funnel: {
      submitted: n.submitted,
      accepted: n.accepted,
      screened: n.accepted,
      interviewed: n.interviewed,
      offered: n.offered,
      duplicate: 0,
      rejected_at_screening: 0,
      rejected_after_interview: 0,
      in_flight: 0,
    },
    rates: { accept: null, screen_through: null, offer: null, end_to_end: null },
    previous: null,
    median_days_to_interview: null,
    by_skill: [],
  };
}

describe("benchmark suppression", () => {
  const me = vendorWith("me", { submitted: 10, accepted: 8, interviewed: 4, offered: 1 });

  it("is withheld when only one other agency has data", () => {
    // The dangerous case: "the others' average" IS that agency's numbers.
    const out = benchmark([me, vendorWith("a", { submitted: 5, accepted: 4, interviewed: 2, offered: 1 })], "me");
    expect(out.available).toBe(false);
    expect(out.peer_count).toBe(1);
  });

  it("is withheld at two, where one subtraction still identifies", () => {
    const out = benchmark(
      [
        me,
        vendorWith("a", { submitted: 5, accepted: 4, interviewed: 2, offered: 1 }),
        vendorWith("b", { submitted: 6, accepted: 5, interviewed: 3, offered: 0 }),
      ],
      "me",
    );
    expect(out.available).toBe(false);
    expect(out.peer_count).toBe(2);
  });

  it("says WHY it is withheld rather than rendering an empty panel", () => {
    const out = benchmark([me], "me");
    expect(out.available).toBe(false);
    if (!out.available) expect(out.reason).toMatch(/at least 3 other agencies/);
  });

  it("appears once enough peers are active", () => {
    const peers = ["a", "b", "c"].map((id) =>
      vendorWith(id, { submitted: 10, accepted: 10, interviewed: 5, offered: 1 }),
    );
    const out = benchmark([me, ...peers], "me");
    expect(out.available).toBe(true);
    expect(out.peer_count).toBe(MIN_PEERS_FOR_BENCHMARK);
  });

  it("never counts the asking vendor in its own benchmark", () => {
    const peers = ["a", "b", "c"].map((id) =>
      vendorWith(id, { submitted: 10, accepted: 10, interviewed: 10, offered: 10 }),
    );
    const out = benchmark([me, ...peers], "me");
    // Peers convert 100%; if `me` (12.5%) leaked in, the pooled rate would drop.
    expect(out.available && out.rates.screen_through).toBe(1);
  });

  it("ignores agencies with no submissions in the window", () => {
    // Otherwise three dormant vendors unlock a benchmark computed from one.
    const dormant = ["a", "b"].map((id) =>
      vendorWith(id, { submitted: 0, accepted: 0, interviewed: 0, offered: 0 }),
    );
    const out = benchmark(
      [me, ...dormant, vendorWith("c", { submitted: 4, accepted: 4, interviewed: 2, offered: 0 })],
      "me",
    );
    expect(out.available).toBe(false);
    expect(out.peer_count).toBe(1);
  });

  it("pools totals rather than averaging rates", () => {
    // A mean of rates lets one tiny agency with a single lucky placement
    // dominate a comparison the client will quote in a fee negotiation.
    const out = benchmark(
      [
        me,
        vendorWith("big", { submitted: 100, accepted: 100, interviewed: 10, offered: 0 }),
        vendorWith("tiny1", { submitted: 1, accepted: 1, interviewed: 1, offered: 0 }),
        vendorWith("tiny2", { submitted: 1, accepted: 1, interviewed: 1, offered: 0 }),
      ],
      "me",
    );
    // Pooled: 12/102 ≈ 0.118. A mean of rates would be (0.1+1+1)/3 ≈ 0.7.
    expect(out.available && out.rates.screen_through).toBeCloseTo(0.118, 2);
  });
});

describe("windows", () => {
  it("offers week through year", () => {
    expect(Object.keys(WINDOWS)).toEqual(["7d", "30d", "91d", "182d", "365d"]);
  });

  it("falls back to the quarter rather than throwing on junk input", () => {
    expect(parseWindow(undefined)).toBe("91d");
    expect(parseWindow("bogus")).toBe("91d");
    expect(parseWindow("7d")).toBe("7d");
  });
});
