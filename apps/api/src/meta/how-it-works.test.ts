import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ALL_PERMISSIONS } from "../entitlements/permissions";

/**
 * The "How it works" page must not be allowed to lie.
 *
 * Its tables are fetched live, so those cannot drift. Its PROSE cannot be —
 * someone has to write "a recruiter screens and rejects" — and prose is
 * exactly what goes stale: a permission gets renamed, a screen moves, and the
 * page carries on describing a product that no longer exists. Nothing fails,
 * so nobody finds out until a new joiner follows it and is wrong.
 *
 * This closes that gap for the two things the page asserts by name: the
 * permission each step requires, and the route it links to. Both are parsed
 * out of the page source and checked against the code. Rename a permission and
 * this fails; delete a screen and this fails.
 *
 * It lives in the API package because that is where the permission list is
 * defined and where the test suite runs.
 */

const PAGE = join(
  __dirname,
  "../../../../apps/web/src/app/how-it-works/page.tsx",
);
const WEB_APP = join(__dirname, "../../../../apps/web/src/app");

const source = readFileSync(PAGE, "utf8");

/** `needs: "positions.create"` — null entries are steps requiring nothing. */
function declaredPermissions(): string[] {
  return [...source.matchAll(/needs:\s*"([^"]+)"/g)].map((m) => m[1]!);
}

/** `where: "/pipeline"` — the screen the step happens on. */
function declaredRoutes(): string[] {
  return [...source.matchAll(/where:\s*"([^"]+)"/g)].map((m) => m[1]!);
}

describe("how-it-works page stays true", () => {
  it("names at least one permission and one route (the parse still works)", () => {
    // Without this, a refactor that changed the STEPS shape would make every
    // assertion below vacuously pass on an empty list.
    expect(declaredPermissions().length).toBeGreaterThan(5);
    expect(declaredRoutes().length).toBeGreaterThan(5);
  });

  it("every permission it claims a step needs actually exists", () => {
    const unknown = declaredPermissions().filter(
      (p) => !(ALL_PERMISSIONS as readonly string[]).includes(p),
    );
    expect(unknown).toEqual([]);
  });

  /**
   * Every URL the app can actually serve.
   *
   * Built by walking the App Router tree and dropping `(group)` segments,
   * which organise files without appearing in the URL. Hardcoding the known
   * groups was the first attempt and it was wrong within the hour — it did not
   * know about `(vendor)`, so it reported a real page as missing.
   */
  function realRoutes(dir = WEB_APP, urlPath = ""): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name === "page.tsx") found.push(urlPath || "/");
      if (!entry.isDirectory()) continue;
      const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
      found.push(
        ...realRoutes(
          join(dir, entry.name),
          isGroup ? urlPath : `${urlPath}/${entry.name}`,
        ),
      );
    }
    return found;
  }

  it("every screen it links to is a real route in the web app", () => {
    const routes = new Set(realRoutes());
    // Dynamic segments: /candidates/[id] serves /candidates/anything.
    const patterns = [...routes].map(
      (r) => new RegExp(`^${r.replace(/\[[^\]]+\]/g, "[^/]+")}$`),
    );
    const missing = declaredRoutes().filter(
      (route) => !patterns.some((p) => p.test(route)),
    );
    expect(missing).toEqual([]);
  });

  it("does not claim a recruiter can record decisions", () => {
    // The specific falsehood that was live on /demo: recruiters screen and
    // reject, but recording a panel's verdict needs decisions.record, which
    // they deliberately do not hold.
    const recruiterStep = source.match(
      /who:\s*"Recruiter",\s*needs:\s*"decisions\.record"/,
    );
    expect(recruiterStep).toBeNull();
  });
});
