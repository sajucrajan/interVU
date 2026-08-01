import { describe, expect, it } from "vitest";
import { buildAccess } from "./access";

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
