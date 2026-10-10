#!/usr/bin/env node
/**
 * Who may call what: the API access suite.
 *
 * Signs in as every demo account and calls the API the way the web app does,
 * then checks each answer against the rules in docs/09: the permission each
 * endpoint needs, the org-unit scope it applies in, and the assignment grants
 * (a panel seat opens the candidate, the room and the panel's scorecards).
 *
 * It exists because two endpoints shipped with no check at all — any member of
 * an organization could read any panel's scorecards, and any candidate's
 * contact details — and nothing noticed. Hiding a link is not access control;
 * this asks the server directly.
 *
 * Four kinds of check:
 *   READ     every GET, for every account: allowed (2xx) or refused (403/404).
 *   LEAK     list endpoints return only rows inside the caller's scope.
 *   WRITE    every risky mutation, for every account that must NOT be able to
 *            make it, with a VALID body — so a refusal is the access check
 *            speaking, not input validation. Allowed accounts are not sent the
 *            write: this suite must not change the data it is reading.
 *   TENANT   a second organization (prisma/seed-tenant-b.ts) and its agency
 *            try every Acme record, and Acme tries every Globex one.
 *
 * Expectations are written as rules over what each account actually holds
 * (/auth/me capabilities, membership scopes, panel seats), not as a table of
 * names, so re-permissioning a role moves the expectations with it.
 *
 * Usage (stack running; main seed + tenant-b seed applied):
 *   API_URL=http://localhost:4000/api/v1 node tools/access-check.mjs
 */

const API = (process.env.API_URL ?? "http://localhost:4000/api/v1").replace(/\/+$/, "");
const PASSWORD = process.env.DEMO_PASSWORD ?? "intervu-demo";

/**
 * POLICY: read-only roles (submissions.view in scope) may read a debrief,
 * scorecard content included — the board links to it for everyone who can see
 * the board. Set to false if debriefs should be limited to people who can act
 * on them, and change applications/debrief.controller.ts to match.
 */
const READ_ONLY_ROLES_READ_DEBRIEFS = true;

const ORG_ACCOUNTS = [
  "admin@acme.test",
  "recruiter@acme.test",
  "hm.eng@acme.test",
  "pm.gtm@acme.test",
  "pm.platform@acme.test",
  "interviewer1@acme.test",
  "interviewer2@acme.test",
  "vendors@acme.test",
];
const VENDOR_ACCOUNTS = ["recruiter@talentbridge.test", "recruiter@hireworks.test"];

// ---------------------------------------------------------------- plumbing

async function login(kind, org, email) {
  const res = await fetch(`${API}/auth/${kind}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ org_slug: org, email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { email, kind, org, cookie };
}

async function call(session, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(session ? { cookie: session.cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, json };
}

const failures = [];
let checks = 0;
const ok = (s) => s >= 200 && s < 300;
const refused = (s) => s === 401 || s === 403 || s === 404;

function expect(kind, who, method, path, allowed, status, why) {
  checks += 1;
  const good = allowed ? ok(status) : refused(status);
  if (!good) {
    failures.push(
      `${kind.padEnd(6)} ${who.padEnd(32)} ${method.padEnd(6)} ${path}  → ${status}, expected ${
        allowed ? "2xx" : "403/404"
      }${why ? `  (${why})` : ""}`,
    );
  }
}

// ---------------------------------------------------------------- the world

const admin = await login("org", "acme", "admin@acme.test");
// /org-units answers as a tree; flatten it, keeping each node's parent.
const units = [];
const flatten = (nodes, parentId) => {
  for (const n of nodes) {
    units.push({ id: n.id, name: n.name, parentId });
    flatten(n.children ?? [], n.id);
  }
};
flatten((await call(admin, "GET", "/org-units")).json, null);
const childrenOf = new Map();
for (const u of units) {
  const list = childrenOf.get(u.parentId) ?? [];
  list.push(u.id);
  childrenOf.set(u.parentId, list);
}
const subtree = (id) => {
  const out = [];
  const queue = [id];
  while (queue.length) {
    const x = queue.shift();
    out.push(x);
    queue.push(...(childrenOf.get(x) ?? []));
  }
  return out;
};

const positions = (await call(admin, "GET", "/positions")).json;
const applications = (await call(admin, "GET", "/applications")).json;
const unitOfPosition = new Map(positions.map((p) => [p.id, p.orgUnitId]));

/** One account's facts, from the server's own view of it. */
async function facts(session) {
  const me = (await call(session, "GET", "/auth/me")).json;
  const roles = (await call(admin, "GET", "/roles")).json;
  const permsOfRole = new Map(roles.map((r) => [r.id, r.permissions]));
  // Scope per permission: "org", or the union of the granted subtrees.
  const scope = new Map();
  for (const m of me.memberships) {
    for (const p of permsOfRole.get(m.role_id) ?? []) {
      if (scope.get(p) === "org") continue;
      if (m.org_unit_id === null) scope.set(p, "org");
      else scope.set(p, [...(scope.get(p) ?? []), ...subtree(m.org_unit_id)]);
    }
  }
  const mine = (await call(session, "GET", "/interviews/mine")).json;
  return {
    ...session,
    id: me.id,
    can: (perm, unitId) => {
      const s = scope.get(perm);
      if (!s) return false;
      if (s === "org" || unitId === undefined) return true;
      return s.includes(unitId);
    },
    inScope: (perm, unitId) => {
      const s = scope.get(perm);
      return s === "org" || (Array.isArray(s) && s.includes(unitId));
    },
    seats: mine,
  };
}

const accounts = [];
for (const email of ORG_ACCOUNTS) {
  accounts.push(await facts(email === admin.email ? admin : await login("org", "acme", email)));
}

// Fixtures: one undecided application in Engineering and one in GTM, each with
// an interview someone sits on — the two places scope and assignment cross.
const indira = accounts.find((a) => a.email === "interviewer1@acme.test");
const seatApps = new Set(indira.seats.map((s) => s.application_id));
const byUnitRoot = (rootName) => {
  const root = units.find((u) => u.name === rootName && u.parentId === null);
  const ids = subtree(root.id);
  return applications.find(
    (a) => seatApps.has(a.id) && !a.decision && ids.includes(a.position.orgUnitId),
  );
};
const fixtures = [byUnitRoot("Engineering"), byUnitRoot("GTM")].filter(Boolean);
if (fixtures.length < 2) throw new Error("seed is missing the panel fixtures this suite needs");

const panelOf = new Map(); // applicationId → Set(orgUserId)
const interviewsOf = new Map(); // applicationId → interview ids
for (const acc of accounts) {
  for (const s of acc.seats) {
    if (!panelOf.has(s.application_id)) panelOf.set(s.application_id, new Set());
    panelOf.get(s.application_id).add(acc.id);
    if (!interviewsOf.has(s.application_id)) interviewsOf.set(s.application_id, new Set());
    interviewsOf.get(s.application_id).add(s.id);
  }
}
const onPanel = (acc, appId) => panelOf.get(appId)?.has(acc.id) ?? false;
const seatOn = (acc, interviewId) => acc.seats.some((s) => s.id === interviewId);

// ---------------------------------------------------------------- READ

const ALL = () => true;
const perm = (p) => (acc) => acc.can(p);
const any = (...ps) => (acc) => ps.some((p) => acc.can(p));

const flatReads = [
  ["/auth/me", ALL],
  ["/me/worklist", ALL],
  ["/interviews/mine", ALL],
  ["/org-units", ALL],
  ["/org-users", ALL],
  ["/questions", ALL],
  ["/questions/skills", ALL],
  ["/search?q=a", ALL],
  ["/analytics/overview", ALL],
  ["/analytics/channels", ALL],
  ["/applications", ALL],
  ["/positions", ALL],
  ["/org-units/manage", perm("org.manage_structure")],
  ["/org-users/manage", perm("org.manage_users")],
  ["/roles", perm("org.manage_users")],
  ["/roles/permissions", perm("org.manage_users")],
  ["/settings", perm("org.settings")],
  ["/notification-deliveries", perm("org.settings")],
  ["/webhooks", perm("org.settings")],
  ["/vendors", perm("positions.view")],
  ["/vendors/manage", perm("vendors.manage")],
  ["/analytics/vendors", any("vendors.manage", "vendors.view_performance")],
  ["/analytics/performance", perm("positions.view")],
  ["/position-templates", perm("positions.view")],
  ["/skills", perm("positions.view")],
  ["/panels", perm("interviews.schedule")],
  ["/match-reviews", perm("candidates.merge")],
  ["/pipeline/board", perm("submissions.view")],
];

for (const acc of accounts) {
  for (const [path, rule] of flatReads) {
    const r = await call(acc, "GET", path);
    expect("READ", acc.email, "GET", path, rule(acc), r.status);
  }

  for (const app of fixtures) {
    const unit = app.position.orgUnitId;
    const posId = app.position.id;
    const cand = app.candidate.id;
    const history = acc.inScope("candidates.view_history", unit);
    const seat = onPanel(acc, app.id);
    const rules = [
      [`/positions/${posId}`, acc.inScope("positions.view", unit) || seat, "positions.view in scope, or a panel seat (brief)"],
      [`/applications/${app.id}/screening`, acc.inScope("submissions.view", unit), "submissions.view in scope"],
      [
        `/applications/${app.id}/debrief`,
        READ_ONLY_ROLES_READ_DEBRIEFS
          ? acc.inScope("submissions.view", unit)
          : acc.inScope("decisions.record", unit) || acc.inScope("applications.transition", unit),
        "debrief policy",
      ],
      [`/applications/${app.id}/scorecards`, history || seat, "history in scope, or a panel seat"],
      [`/applications/${app.id}/panel-suggestions`, acc.inScope("interviews.schedule", unit), "interviews.schedule in scope"],
      // One application per fixture candidate in the seed, so its unit decides.
      [`/candidates/${cand}/timeline`, history || (seat && !app.decision), "history in scope, or an undecided panel seat"],
      [`/candidates/${cand}/dossier`, history || (seat && !app.decision), "same gate as the timeline"],
    ];
    for (const id of interviewsOf.get(app.id) ?? []) {
      rules.push([`/interviews/${id}/room`, seatOn(acc, id), "panel seat only — not even an admin"]);
    }
    for (const [path, allowed, why] of rules) {
      const r = await call(acc, "GET", path);
      expect("READ", acc.email, "GET", path, allowed, r.status, why);
    }
  }
}

// ---------------------------------------------------------------- LEAK

for (const acc of accounts) {
  const pos = (await call(acc, "GET", "/positions")).json ?? [];
  for (const p of pos) {
    checks += 1;
    if (!acc.inScope("positions.view", p.orgUnitId)) {
      failures.push(`LEAK   ${acc.email.padEnd(32)} /positions returned ${p.reference}, outside positions.view scope`);
    }
  }
  const apps = (await call(acc, "GET", "/applications")).json ?? [];
  for (const a of apps) {
    checks += 1;
    if (!acc.inScope("submissions.view", unitOfPosition.get(a.positionId))) {
      failures.push(`LEAK   ${acc.email.padEnd(32)} /applications returned ${a.id}, outside submissions.view scope`);
    }
  }
}

// ---------------------------------------------------------------- WRITE

// Every account that must be refused is sent a body that would succeed, so
// only the access check can stop it. Nothing here runs for allowed accounts.
const [engApp] = fixtures;
const otherCandidate = applications.find((a) => a.candidate.id !== engApp.candidate.id).candidate.id;
const review = (await call(admin, "GET", "/match-reviews")).json?.[0];
const role = (await call(admin, "GET", "/roles")).json.find((r) => !r.is_system);
const engInterview = [...(interviewsOf.get(engApp.id) ?? [])][0];
const engUnit = engApp.position.orgUnitId;

const writes = [
  ["PATCH", "/settings", {}, (a) => a.can("org.settings")],
  ["POST", "/webhooks", { url: "https://example.test/hook", events: [] }, (a) => a.can("org.settings")],
  ["POST", "/roles", { name: "Access check", permissions: [] }, (a) => a.can("org.manage_users")],
  role && ["PATCH", `/roles/${role.id}`, { description: "x" }, (a) => a.can("org.manage_users")],
  [
    "POST",
    "/org-users",
    { email: "access-check@acme.test", name: "Access Check", memberships: [{ role_id: role?.id, org_unit_id: null }] },
    (a) => a.can("org.manage_users"),
  ],
  ["POST", "/org-units", { name: "Access check", kind: "team", parent_id: engUnit }, (a) => a.can("org.manage_structure")],
  ["POST", "/vendors", { name: "Access Check Agency" }, (a) => a.can("vendors.manage")],
  ["POST", "/position-templates", { name: "Access check", summary: "" }, (a) => a.can("positions.create")],
  ["POST", `/positions/${engApp.position.id}/publish`, { mode: "manual" }, (a) => a.inScope("positions.publish", engUnit)],
  // A mismatched confirmation: even an allowed caller erases nothing.
  ["DELETE", `/candidates/${engApp.candidate.id}`, { confirm: "not-this-id" }, (a) => a.can("org.settings")],
  ["POST", `/candidates/${engApp.candidate.id}/merge`, { merge_candidate_id: otherCandidate }, (a) => a.can("candidates.merge")],
  ["POST", `/candidates/${engApp.candidate.id}/flags`, { kind: "note", reason: "access check" }, (a) => a.can("candidates.flag")],
  review && ["POST", `/match-reviews/${review.id}/resolve`, { action: "keep_separate" }, (a) => a.can("candidates.merge")],
  ["POST", `/applications/${engApp.id}/transition`, { to_stage: "screening" }, (a) => a.inScope("applications.transition", engUnit)],
  ["POST", `/applications/${engApp.id}/decision`, { outcome: "hold", reason: "access check" }, (a) => a.inScope("decisions.record", engUnit)],
  [
    "POST",
    `/applications/${engApp.id}/interviews`,
    { round_name: "Access check", scheduled_at: new Date(Date.now() + 864e5).toISOString(), panelist_ids: [indira.id] },
    (a) => a.inScope("interviews.schedule", engUnit),
  ],
  ["POST", `/applications/${engApp.id}/debrief/release`, {}, (a) => a.inScope("decisions.record", engUnit)],
  engInterview && [
    "POST",
    `/interviews/${engInterview}/scorecards`,
    { overall_rating: 3, recommendation: "yes", notes: "access check", competencies: [] },
    (a) => seatOn(a, engInterview),
  ],
  engInterview && ["PUT", `/interviews/${engInterview}/draft`, { notes: {} }, (a) => seatOn(a, engInterview)],
].filter(Boolean);

for (const acc of accounts) {
  for (const [method, path, body, allowedRule] of writes) {
    if (allowedRule(acc)) continue;
    const r = await call(acc, method, path, body);
    expect("WRITE", acc.email, method, path, false, r.status);
  }
}

// ---------------------------------------------------------------- vendors

for (const email of VENDOR_ACCOUNTS) {
  const v = await login("vendor", "acme", email);
  // An agency reaches nothing on the organization side.
  for (const path of [
    "/positions",
    "/applications",
    "/pipeline/board",
    "/me/worklist",
    `/candidates/${engApp.candidate.id}/timeline`,
    `/candidates/${engApp.candidate.id}/dossier`,
    `/applications/${engApp.id}/scorecards`,
    `/applications/${engApp.id}/debrief`,
  ]) {
    const r = await call(v, "GET", path);
    expect("VENDOR", email, "GET", path, false, r.status, "org endpoint");
  }
  // And only its own releases on the vendor side.
  const visible = new Set(((await call(v, "GET", "/vendor/positions")).json ?? []).map((p) => p.id));
  for (const p of positions) {
    if (visible.has(p.id)) continue;
    const r = await call(v, "GET", `/vendor/positions/${p.id}`);
    expect("VENDOR", email, "GET", `/vendor/positions/${p.id}`, false, r.status, `${p.reference} not released to it`);
  }
}
// Org accounts reach nothing on the vendor side.
for (const acc of accounts) {
  for (const path of ["/vendor", "/vendor/positions", "/vendor/submissions"]) {
    const r = await call(acc, "GET", path);
    expect("VENDOR", acc.email, "GET", path, false, r.status, "vendor portal");
  }
}

// ---------------------------------------------------------------- TENANT

const globex = await login("org", "globex", "admin@globex.test");
const gPositions = (await call(globex, "GET", "/positions")).json;
const gApps = (await call(globex, "GET", "/applications")).json;
if (!gApps?.length) throw new Error("tenant B is not seeded: pnpm --filter @intervu/api db:seed:tenant-b");
const gApp = gApps[0];
const gInterview = (await call(globex, "GET", "/interviews/mine")).json[0];

const tenantPaths = (p, a, interviewId) => [
  `/positions/${p}`,
  `/applications/${a.id}/screening`,
  `/applications/${a.id}/debrief`,
  `/applications/${a.id}/scorecards`,
  `/candidates/${a.candidate.id}/timeline`,
  `/candidates/${a.candidate.id}/dossier`,
  ...(interviewId ? [`/interviews/${interviewId}/room`] : []),
];

// Acme's most privileged account against every Globex record…
for (const path of tenantPaths(gPositions[0].id, gApp, gInterview?.id)) {
  const r = await call(admin, "GET", path);
  expect("TENANT", admin.email, "GET", path, false, r.status, "Globex record");
}
for (const [method, path, body] of [
  ["POST", `/applications/${gApp.id}/transition`, { to_stage: "screening" }],
  ["POST", `/applications/${gApp.id}/decision`, { outcome: "hold", reason: "x" }],
  ["POST", `/candidates/${gApp.candidate.id}/flags`, { kind: "note", reason: "x" }],
]) {
  const r = await call(admin, method, path, body);
  expect("TENANT", admin.email, method, path, false, r.status, "Globex record");
}
// …Globex's admin against Acme's…
for (const path of tenantPaths(engApp.position.id, engApp, engInterview)) {
  const r = await call(globex, "GET", path);
  expect("TENANT", globex.email, "GET", path, false, r.status, "Acme record");
}
// …and neither list ever carries the other's rows.
for (const [session, foreignIds, label] of [
  [admin, new Set([...gPositions.map((p) => p.id), ...gApps.map((a) => a.id)]), "Globex"],
  [globex, new Set([...positions.map((p) => p.id), ...applications.map((a) => a.id)]), "Acme"],
]) {
  for (const path of ["/positions", "/applications"]) {
    checks += 1;
    const rows = (await call(session, "GET", path)).json ?? [];
    const leaked = rows.filter((r) => foreignIds.has(r.id));
    if (leaked.length) failures.push(`TENANT ${session.email.padEnd(32)} ${path} returned ${leaked.length} ${label} row(s)`);
  }
}
// Globex's agency sees nothing of Acme's, and Acme's agency nothing of Globex's.
const gVendor = await login("vendor", "globex", "recruiter@globexstaffing.test");
for (const p of positions) {
  const r = await call(gVendor, "GET", `/vendor/positions/${p.id}`);
  expect("TENANT", gVendor.email, "GET", `/vendor/positions/${p.id}`, false, r.status, "Acme position");
}
const tb = await login("vendor", "acme", "recruiter@talentbridge.test");
const r = await call(tb, "GET", `/vendor/positions/${gPositions[0].id}`);
expect("TENANT", tb.email, "GET", `/vendor/positions/${gPositions[0].id}`, false, r.status, "Globex position");

// ---------------------------------------------------------------- report

console.log(`${checks} checks across ${accounts.length} org accounts, ${VENDOR_ACCOUNTS.length + 1} agencies and 2 organizations.`);
if (failures.length) {
  console.log(`\n${failures.length} access failure${failures.length === 1 ? "" : "s"}:\n`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log("Every answer matched the rules.");
