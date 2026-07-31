import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone.js";

describe("normalizePhone", () => {
  it("parses to E.164 with default region", () => {
    expect(normalizePhone("(415) 555-2671").e164).toBe("+14155552671");
  });

  it("respects explicit country codes over default region", () => {
    expect(normalizePhone("+91 98765 43210", "US").e164).toBe("+919876543210");
  });

  it("parses national formats for the given region", () => {
    expect(normalizePhone("098765 43210", "IN").e164).toBe("+919876543210");
  });

  it("produces the same last10 with and without country code", () => {
    const withCc = normalizePhone("+1 415 555 2671");
    const withoutCc = normalizePhone("415-555-2671");
    expect(withCc.last10).toBe("4155552671");
    expect(withCc.last10).toBe(withoutCc.last10);
  });

  it("returns nulls for garbage", () => {
    expect(normalizePhone("call me maybe")).toEqual({ e164: null, last10: null });
    expect(normalizePhone("12345").last10).toBeNull();
  });
});
