import { describe, expect, it } from "vitest";
import { membershipsFor, personasFor, resolvePersona } from "./persona";
import type { ResolvedMembership } from "../tenancy/tenant-context";

/**
 * One person, several jobs. The cases that matter: a role at two scopes is
 * one persona, a panel seat alone makes an interviewer, the interviewer
 * persona carries no tree grants, and "ask each time" wins over a default.
 */
const grant = (over: Partial<ResolvedMembership>): ResolvedMembership => ({
  roleId: "r",
  roleKey: "hiring_manager",
  roleName: "Hiring manager",
  permissions: ["positions.view", "decisions.record"],
  orgUnitId: "eng",
  ...over,
});
const units = new Map([
  ["eng", "Engineering"],
  ["gtm", "GTM"],
]);

describe("personasFor", () => {
  it("makes one persona per distinct role, naming every scope it is granted at", () => {
    const ps = personasFor([grant({}), grant({ orgUnitId: "gtm" })], false, units);
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ key: "hiring_manager", scope: "Engineering, GTM" });
  });

  it("adds the interviewer persona for a panel seat, even with no interviewer role", () => {
    const ps = personasFor([grant({})], true, units);
    expect(ps.map((p) => p.key)).toEqual(["hiring_manager", "interviewer"]);
  });

  it("turns a scorecards-only role into the interviewer persona, not a role persona", () => {
    const iv = grant({ roleKey: "interviewer", roleName: "Interviewer", permissions: ["scorecards.submit"], orgUnitId: null });
    expect(personasFor([iv], false, units).map((p) => p.key)).toEqual(["interviewer"]);
  });

  it("puts the admin persona first", () => {
    const admin = grant({ roleKey: "org_admin", roleName: "Organization admin", permissions: ["org.manage_users"], orgUnitId: null });
    const ps = personasFor([grant({}), admin], false, units);
    expect(ps.map((p) => p.key)).toEqual(["org_admin", "hiring_manager"]);
    expect(ps[0]!.scope).toBe("Whole organization");
  });
});

describe("membershipsFor", () => {
  it("keeps only the active role's grants, and none for the interviewer", () => {
    const ms = [grant({}), grant({ roleKey: "recruiter", roleName: "Recruiter", orgUnitId: null })];
    const [hm, , iv] = personasFor(ms, true, units);
    expect(membershipsFor(hm!, ms).map((m) => m.roleKey)).toEqual(["hiring_manager"]);
    expect(membershipsFor(iv!, ms)).toEqual([]);
    expect(membershipsFor(null, ms)).toEqual([]);
  });
});

describe("resolvePersona", () => {
  const ps = personasFor([grant({})], true, units);

  it("needs no choice when there is only one", () => {
    expect(resolvePersona(ps.slice(0, 1), { stored: null, preferred: null, askEachTime: true })?.key).toBe("hiring_manager");
  });

  it("uses the session's choice, then the default, then asks", () => {
    expect(resolvePersona(ps, { stored: "interviewer", preferred: "hiring_manager", askEachTime: false })?.key).toBe("interviewer");
    expect(resolvePersona(ps, { stored: null, preferred: "hiring_manager", askEachTime: false })?.key).toBe("hiring_manager");
    expect(resolvePersona(ps, { stored: null, preferred: null, askEachTime: false })).toBeNull();
  });

  it("asks every time when told to, ignoring the default", () => {
    expect(resolvePersona(ps, { stored: null, preferred: "hiring_manager", askEachTime: true })).toBeNull();
  });

  it("ignores a stored persona the person no longer holds", () => {
    expect(resolvePersona(ps, { stored: "org_admin", preferred: null, askEachTime: false })).toBeNull();
  });
});
