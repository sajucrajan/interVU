import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email.js";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });

  it("strips +tags", () => {
    expect(normalizeEmail("jane+vendorA@example.com")).toBe("jane@example.com");
  });

  it("strips dots only on dot-ignoring providers", () => {
    expect(normalizeEmail("j.a.n.e@gmail.com")).toBe("jane@gmail.com");
    expect(normalizeEmail("j.a.n.e@example.com")).toBe("j.a.n.e@example.com");
  });

  it("canonicalizes googlemail to gmail", () => {
    expect(normalizeEmail("Jane.Doe+x@googlemail.com")).toBe("janedoe@gmail.com");
  });

  it("makes vendor-disguised gmail variants collide", () => {
    const a = normalizeEmail("jane.doe+agency1@gmail.com");
    const b = normalizeEmail("JANEDOE+agency2@googlemail.com");
    expect(a).toBe(b);
  });

  it("respects option toggles", () => {
    expect(normalizeEmail("j.ane+t@gmail.com", { providerDotStripping: false })).toBe("j.ane@gmail.com");
    expect(normalizeEmail("jane+t@example.com", { stripPlusTag: false })).toBe("jane+t@example.com");
  });

  it("rejects implausible inputs", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("@example.com")).toBeNull();
    expect(normalizeEmail("jane@")).toBeNull();
    expect(normalizeEmail("jane@nodot")).toBeNull();
    expect(normalizeEmail("+tag@gmail.com")).toBeNull();
  });
});
