import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Redaction is meant to be a property of the SCHEMA, not of the serializer:
 * the packet cannot leak an interviewer or a rating because it never holds
 * one. These assertions fail loudly if someone later adds such a field,
 * which is precisely when the guarantee would quietly stop being true.
 */
const schema = readFileSync(
  join(__dirname, "../../prisma/schema.prisma"),
  "utf8",
);

function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  return schema.slice(start, schema.indexOf("\n}", start));
}

describe("feedback packet cannot leak internals", () => {
  const packet = modelBlock("FeedbackPacket");

  it("has no relation to a scorecard, interview or org user", () => {
    for (const forbidden of ["Scorecard", "Interview", "OrgUser"]) {
      expect(packet).not.toContain(forbidden);
    }
  });

  it("carries no numeric rating or score of any kind", () => {
    expect(packet).not.toMatch(/\brating\b/i);
    expect(packet).not.toMatch(/\bscore\b/i);
    expect(packet).not.toMatch(/\bInt\b/);
  });

  it("holds only competency NAMES for strengths and gaps", () => {
    // String arrays, not references to a rated entity.
    expect(packet).toMatch(/strengths\s+String\[\]/);
    expect(packet).toMatch(/gaps\s+String\[\]/);
  });

  it("keeps the internal reason on the debrief, never on the packet", () => {
    expect(packet).not.toContain("internalReason");
    expect(modelBlock("Debrief")).toContain("internalReason");
  });

  it("starts life as a draft, so nothing unreviewed can be released", () => {
    expect(packet).toMatch(/isDraft\s+Boolean\s+@default\(true\)/);
  });
});
