import { describe, expect, it } from "vitest";
import { buildAccess } from "./access";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  SYSTEM_ROLES,
  sanitizePermissions,
} from "./permissions";

/**
 * The org tree used throughout:
 *
 *   engineering ── platform ── platform-core
 *              └── product
 *   gtm        ── sales
 */
const UNITS = [
  { id: "engineering", parentId: null },
  { id: "platform", parentId: "engineering" },
  { id: "platform-core", parentId: "platform" },
  { id: "product", parentId: "engineering" },
  { id: "gtm", parentId: null },
  { id: "sales", parentId: "gtm" },
];

describe("scope inheritance", () => {
  it("covers a unit and everything beneath it", () => {
    const access = buildAccess(
      [{ orgUnitId: "engineering", permissions: ["positions.view"] }],
      UNITS,
    );
    expect(access.can("positions.view", "engineering")).toBe(true);
    expect(access.can("positions.view", "platform")).toBe(true);
    // Two levels down still inherits.
    expect(access.can("positions.view", "platform-core")).toBe(true);
  });

  it("does not leak sideways or upward", () => {
    const access = buildAccess(
      [{ orgUnitId: "platform", permissions: ["positions.view"] }],
      UNITS,
    );
    expect(access.can("positions.view", "product")).toBe(false);
    expect(access.can("positions.view", "engineering")).toBe(false);
    expect(access.can("positions.view", "sales")).toBe(false);
  });

  it("unions several grants", () => {
    const access = buildAccess(
      [
        { orgUnitId: "platform", permissions: ["positions.view"] },
        { orgUnitId: "sales", permissions: ["positions.view"] },
      ],
      UNITS,
    );
    expect(access.unitIdsFor("positions.view")).toEqual(
      expect.arrayContaining(["platform", "platform-core", "sales"]),
    );
    expect(access.can("positions.view", "product")).toBe(false);
  });

  it("treats an org-wide grant as everything", () => {
    const access = buildAccess(
      [{ orgUnitId: null, permissions: ["positions.view"] }],
      UNITS,
    );
    expect(access.unitIdsFor("positions.view")).toBe("org");
    expect(access.can("positions.view", "anything-at-all")).toBe(true);
  });

  it("keeps permissions separate", () => {
    const access = buildAccess(
      [{ orgUnitId: "platform", permissions: ["positions.view"] }],
      UNITS,
    );
    expect(access.can("positions.publish", "platform")).toBe(false);
  });
});

describe("canGrantAt", () => {
  it("lets an org-wide admin grant anywhere, including org-wide", () => {
    const access = buildAccess(
      [{ orgUnitId: null, permissions: ["org.manage_users"] }],
      UNITS,
    );
    expect(access.canGrantAt("org.manage_users", null)).toBe(true);
    expect(access.canGrantAt("org.manage_users", "sales")).toBe(true);
  });

  it("stops a unit-scoped admin from minting an org-wide grant", () => {
    const access = buildAccess(
      [{ orgUnitId: "platform", permissions: ["org.manage_users"] }],
      UNITS,
    );
    // This is the escalation the rule exists to prevent: `can()` alone would
    // have said yes, because the user does hold the permission *somewhere*.
    expect(access.can("org.manage_users")).toBe(true);
    expect(access.canGrantAt("org.manage_users", null)).toBe(false);
  });

  it("confines a unit-scoped admin to their own subtree", () => {
    const access = buildAccess(
      [{ orgUnitId: "platform", permissions: ["org.manage_users"] }],
      UNITS,
    );
    expect(access.canGrantAt("org.manage_users", "platform")).toBe(true);
    expect(access.canGrantAt("org.manage_users", "platform-core")).toBe(true);
    expect(access.canGrantAt("org.manage_users", "product")).toBe(false);
    expect(access.canGrantAt("org.manage_users", "engineering")).toBe(false);
  });

  it("refuses when the user lacks the permission entirely", () => {
    const access = buildAccess(
      [{ orgUnitId: null, permissions: ["positions.view"] }],
      UNITS,
    );
    expect(access.canGrantAt("org.manage_users", null)).toBe(false);
    expect(access.canGrantAt("org.manage_users", "platform")).toBe(false);
  });
});

describe("permission catalog", () => {
  it("lists every permission exactly once, grouped", () => {
    const flat = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    expect(new Set(flat).size).toBe(flat.length);
    expect(ALL_PERMISSIONS.length).toBe(flat.length);
  });

  it("grants nothing for a permission the code no longer knows", () => {
    // A role stored before a permission was renamed must not keep granting it.
    expect(sanitizePermissions(["positions.view", "positions.teleport"])).toEqual([
      "positions.view",
    ]);
    expect(sanitizePermissions(["", "  ", "nonsense"])).toEqual([]);
  });

  it("de-duplicates", () => {
    expect(sanitizePermissions(["positions.view", "positions.view"])).toEqual([
      "positions.view",
    ]);
  });
});

describe("system roles", () => {
  it("only reference permissions that exist", () => {
    for (const role of SYSTEM_ROLES) {
      expect(sanitizePermissions([...role.permissions]).sort()).toEqual(
        [...role.permissions].sort(),
      );
    }
  });

  it("keeps an admin able to administer, or nobody could grant anything", () => {
    const admin = SYSTEM_ROLES.find((r) => r.key === "org_admin");
    expect(admin?.permissions).toContain("org.manage_users");
    expect(admin?.permissions).toContain("org.manage_structure");
  });

  it("keeps interviewers assignment-scoped rather than tree-scoped", () => {
    // docs/09 §4.2: an interviewer's reach comes from panel membership, so the
    // role itself must not carry any tree-scoped read permission.
    const interviewer = SYSTEM_ROLES.find((r) => r.key === "interviewer");
    expect(interviewer?.permissions).toEqual(["scorecards.submit"]);
  });
});

describe("custom roles resolve like built-in ones", () => {
  it("gives a made-up role exactly the permissions it was defined with", () => {
    // "Release Train Engineer" over three teams that do not share a parent —
    // the shape the org hierarchy actually takes.
    const rte = ["positions.view", "submissions.view"] as const;
    const access = buildAccess(
      [
        { orgUnitId: "platform", permissions: [...rte] },
        { orgUnitId: "product", permissions: [...rte] },
        { orgUnitId: "sales", permissions: [...rte] },
      ],
      UNITS,
    );
    expect(access.can("positions.view", "platform-core")).toBe(true);
    expect(access.can("positions.view", "sales")).toBe(true);
    expect(access.can("positions.view", "gtm")).toBe(false);
    expect(access.can("positions.create", "platform")).toBe(false);
  });

  it("unions a narrow role with a broad one", () => {
    const access = buildAccess(
      [
        { orgUnitId: null, permissions: ["positions.view"] },
        { orgUnitId: "platform", permissions: ["decisions.record"] },
      ],
      UNITS,
    );
    expect(access.can("positions.view", "sales")).toBe(true);
    expect(access.can("decisions.record", "platform-core")).toBe(true);
    expect(access.can("decisions.record", "sales")).toBe(false);
  });
});
