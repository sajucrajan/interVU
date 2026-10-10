#!/usr/bin/env node
/**
 * Dead-end check: sign in as every demo account, follow every in-app link a
 * page offers, and fail if any of them lands somewhere that person cannot use.
 *
 * Why this exists: role gating is spread over the rail, the command palette,
 * page actions and plain links inside tables. Each was right on its own and
 * still, between them, an interviewer was linked to a candidate page that
 * refused them, a project manager to a review queue that sat on "Loading…",
 * and every role to an admin page with nothing for them. Nothing a unit test
 * looks at catches a link that is fine for one role and a wall for another.
 *
 * A page FAILS when, for the account following the link:
 *   - it renders a refusal ("Not available to your role") or a bare error;
 *   - it never gets past "Loading…", or renders no heading and almost no text;
 *   - it makes an API call that comes back 4xx/5xx (a refused fetch behind
 *     an otherwise-fine page is a link to data the viewer cannot have).
 *
 * Usage (stack running, seeded with `pnpm --filter @intervu/api db:seed`):
 *   WEB_URL=http://localhost:3000 node tools/link-check.mjs
 *   ONLY=hm.eng@acme.test node tools/link-check.mjs   # one account, comma-separated
 *
 * Playwright is not a workspace dependency (it is only needed here). Point
 * PLAYWRIGHT_FROM at any directory whose node_modules holds it — CI installs
 * it into a scratch prefix. Defaults to resolving from this repo.
 */
import { createRequire } from "node:module";

const require = createRequire(process.env.PLAYWRIGHT_FROM ?? import.meta.url);
const { chromium } = require("playwright");

const WEB = (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ORG = process.env.DEMO_ORG ?? "acme";
const PASSWORD = process.env.DEMO_PASSWORD ?? "intervu-demo";
const MAX_PAGES = Number(process.env.MAX_PAGES ?? 60);

/** Every demo account (docs/10). [email, kind, first page] */
const PERSONAS = [
  ["admin@acme.test", "org", "/dashboard"],
  ["recruiter@acme.test", "org", "/dashboard"],
  ["hm.eng@acme.test", "org", "/dashboard"],
  ["pm.gtm@acme.test", "org", "/dashboard"],
  ["pm.platform@acme.test", "org", "/dashboard"],
  ["interviewer1@acme.test", "org", "/dashboard"],
  ["interviewer2@acme.test", "org", "/dashboard"],
  ["vendors@acme.test", "org", "/dashboard"],
  ["recruiter@talentbridge.test", "vendor", "/vendor"],
  ["recruiter@hireworks.test", "vendor", "/vendor"],
];

const REFUSED =
  /not available to your role|insufficient scope|don.t have access|forbidden|something went wrong|unauthori[sz]ed|cannot GET|failed to load|application error|client-side exception|request failed/i;

/** Where a link leaves the signed-in app, or would sign the crawler out. */
const SKIP = [/^\/api\//, /^\/demo/, /^\/login/, /^\/vendor\/login/, /^\/activate/, /^\/how-it-works/, /^\/design/];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const pattern = (u) => u.replace(UUID, ":id").replace(/\?.*/, "");

const browser = await chromium.launch();
let failures = 0;

const only = process.env.ONLY?.split(",").map((e) => e.trim()).filter(Boolean);
const selected = only?.length ? PERSONAS.filter(([email]) => only.includes(email)) : PERSONAS;

for (const [email, kind, start] of selected) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const apiErrors = [];
  page.on("response", (r) => {
    const url = r.url();
    // /auth/me is the "am I signed in?" probe; a 401 there is not a dead link.
    if (url.includes("/api/v1/") && r.status() >= 400 && !url.includes("/api/v1/auth/")) {
      apiErrors.push(`${r.status()} ${r.request().method()} ${pattern(url.replace(/.*\/api\/v1/, ""))}`);
    }
  });

  await page.goto(`${WEB}/login`);
  const status = await page.evaluate(
    async ([email, kind, org, password]) => {
      const res = await fetch(`/api/v1/auth/${kind}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ org_slug: org, email, password }),
      });
      return res.status;
    },
    [email, kind, ORG, PASSWORD],
  );
  if (status >= 300) {
    console.log(`\n✗ ${email}: sign-in failed (${status})`);
    failures += 1;
    await ctx.close();
    continue;
  }

  const seen = new Set();
  const perPattern = new Map();
  const queue = [start];
  const problems = [];
  // Where each URL was first linked from, so a failure names the culprit.
  const from = new Map([[start, "(start)"]]);

  while (queue.length && seen.size < MAX_PAGES) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    const pat = pattern(url);
    // Two samples per route shape: enough to catch a per-row gating bug
    // without visiting every candidate in the seed.
    if ((perPattern.get(pat) ?? 0) >= 2) continue;
    perPattern.set(pat, (perPattern.get(pat) ?? 0) + 1);
    seen.add(url);
    apiErrors.length = 0;

    try {
      await page.goto(WEB + url, { waitUntil: "networkidle", timeout: 60_000 });
    } catch {
      problems.push(`${url}  timed out  (linked from ${from.get(url)})`);
      continue;
    }
    await page.waitForTimeout(500);

    const text = (await page.locator("main").first().innerText().catch(() => "")).trim();
    const h1 = (await page.locator("main h1").first().innerText().catch(() => "")).trim();
    const head = text.slice(0, 400).replace(/\s+/g, " ");
    if (REFUSED.test(head) || text === "Loading…" || (!h1 && text.length < 200)) {
      problems.push(`${url}  "${head.slice(0, 100)}"  (linked from ${from.get(url)})`);
    }
    if (apiErrors.length) {
      problems.push(`${url}  API ${[...new Set(apiErrors)].join(", ")}  (linked from ${from.get(url)})`);
    }

    const links = await page.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")));
    for (const l of links) {
      if (!l || l === "/" || SKIP.some((re) => re.test(l))) continue;
      if (!from.has(l)) from.set(l, url);
      queue.push(l);
    }
  }

  const unique = [...new Set(problems)];
  failures += unique.length;
  console.log(`\n${unique.length ? "✗" : "✓"} ${email}: ${seen.size} pages`);
  for (const p of unique) console.log(`    ${p}`);
  await ctx.close();
}

await browser.close();
if (failures) {
  console.log(`\n${failures} dead end${failures === 1 ? "" : "s"} found.`);
  process.exit(1);
}
console.log("\nNo dead ends.");
