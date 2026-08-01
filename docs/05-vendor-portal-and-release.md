# 05 — Vendor Portal, Tiered Release & Ownership Rules

## 1. Vendor model

- `vendor` is a global identity; `vendor_org` is the contract between one org and one vendor. Everything vendor-facing hangs off `vendor_org` (tier, status, contract window).
- **Tier** (`1..n`, 1 = most preferred) is set by the org per vendor and drives tiered release. Tiers are invisible to vendors.
- Vendor users authenticate into a **portal** (`/vendor` route tree) that never renders org-internal data.

### Vendor login is organization-scoped

A vendor signs in with **client organization + email + password** — the same
shape as org login. This is deliberate:

- **The credential namespace is (organization, email), not email.** A global
  email lookup is ambiguous the moment two agencies employ the same address,
  and it makes the sign-in page a cross-tenant enumeration surface.
- **Sessions never span organizations.** `session.organization_id` is set at
  login and every vendor query filters on `vendor_id` **and**
  `organization_id`. An agency supplying three clients signs into each
  separately; there is no switcher that could leak one client's roles,
  submissions, or resumes into another's view. (Enforced by the cross-org
  isolation tests: a session for org A gets `404` on org B's positions.)
- Login requires an existing `vendor_org` contract, so an agency cannot
  discover which organizations exist by probing slugs.

**How the organization is chosen at sign-in** — `GET /auth/login-context`
tells the page what to render, controlled by the `LOGIN_ORG_MODE` env var:

| Mode | Behaviour | Use when |
|---|---|---|
| `auto` *(default)* | Exactly one organization on the deployment → it is resolved automatically and the field disappears ("Signing in to Acme Corp"). More than one → a typed slug, enumerating nothing. | The normal one-org-per-deployment install |
| `picker` | Dropdown of all organizations. | A multi-org install with a soft trust boundary (e.g. subsidiaries) — note it **publishes your organization list to anyone**, including on the vendor tab |
| `manual` | Always a typed slug, never enumerate, even with one organization. | Privacy-strict deployments |

Regardless of mode, invitation links may carry `?org=<slug>` to pre-fill the
field — the recommended way to onboard vendors without either typing or a
public list.

### Separate entry points for internal and external users

Internal staff and external agencies have **opposite exposure requirements**:
the workspace is usually restricted to the corporate network or SSO, while the
vendor portal must be reachable from the public internet. So the two audiences
have distinct entry points — one app, two doors:

| Audience | Sign-in | App routes | API routes |
|---|---|---|---|
| Internal (org users) | `/login` | `/dashboard`, `/analytics`, `/positions/*`, `/candidates/*`, `/interviews`, `/match-reviews` | `/api/v1/*` except `/api/v1/vendor/*` |
| External (vendors) | `/vendor/login` | `/vendor/*` | `/api/v1/vendor/*` + `/api/v1/auth/*` |

The vendor sign-in page makes no mention of the workspace, and vendor
redirects (unauthenticated, sign-out) stay inside `/vendor/*`.

**Publishing only the vendor surface** — point a public hostname
(`vendors.example.com`) at a reverse proxy that allows just:

```
/vendor/*            # portal pages incl. /vendor/login
/api/v1/vendor/*     # vendor data endpoints
/api/v1/auth/*       # login, logout, me, login-context
/_next/*             # static assets
```

…and keep everything else on an internal hostname. Because every vendor data
endpoint already lives under the `/api/v1/vendor` prefix, the allowlist is
mechanical — no per-endpoint auditing. This is defence in depth, not the
primary control: the session guards and org+vendor query scoping remain
authoritative, and both surfaces work fine on one hostname for small installs.

### Vendor lifecycle
`invited → active → suspended → terminated`. Suspension/termination immediately removes portal visibility of open positions; **historical submissions remain** (read-only) because ownership and audit outlive contracts.

## 2. Position release policies

A position in `open` status has exactly one release policy:

| Mode | Behavior |
|---|---|
| `all_at_once` | On publish, create `position_vendor_release` rows for all active vendors, `visible_from = now()` |
| `tiered` | Config = ordered `[{tier, delay_hours}]`. On publish, create rows per vendor with `visible_from = published_at + delay(tier)`. BullMQ delayed jobs fire notifications at each tier's time |
| `manual` | No rows on publish; recruiters release to individual vendors explicitly, any time |

Rules that keep this sane:

- **Visibility is monotonic.** Releases only ever add vendors or move `visible_from` earlier (early-release a tier-3 vendor manually — fine). Revoking visibility happens only via position close/pause or vendor suspension — never by policy re-evaluation.
- **DB is truth, jobs are triggers.** The visibility predicate is always `position.status = 'open' AND now() >= visible_from AND vendor_org.status = 'active'` evaluated at query time. If Redis loses a delayed job, vendors still gain visibility on time; only the *notification* is late (a sweeper cron backfills unsent release notifications).
- **Vendors added mid-flight** (new contract while a tiered position is open): they get a release row per their tier's delay relative to `published_at` — if that time already passed, `visible_from = now()`.
- **Pause vs close:** pause hides the position from portals but keeps submissions/pipelines intact; close is terminal and notifies vendors with in-flight candidates.

## 3. Vendor submission flow

1. Vendor recruiter opens a released position, fills the profile form (name, email, phone required; LinkedIn, current employer/title, location, rate, notes optional) and uploads a resume.
2. **Pre-flight duplicate probe (synchronous, privacy-preserving):** before accepting, the API runs deterministic matching only (email/phone). If the candidate already has an *active* application on this position (or an owning submission inside the ownership window per org scope), respond immediately: *"This candidate is not eligible: already in process from another source."* No source, no dates, no history revealed. This saves vendors wasted effort and is standard VMS behavior.
3. Submission stored with `raw_profile` verbatim (the vendor's version is never mutated by matching), `received_at` stamped server-side — this is the ownership tie-breaker.
4. Full matching pipeline runs async (see [04](04-candidate-matching.md)); vendor sees status `Received → Submitted` once matched/accepted, or `Not eligible` if it lands duplicate after fuzzy review.
5. Same vendor + same position + same deterministic identity = **idempotent update**, not a new submission.

### Coarse status mapping (what vendors see)

Internal pipeline states map to a fixed vendor-facing vocabulary (org-configurable mapping, sane defaults):

`Received · Submitted · Screening · Interviewing · Offered · Hired · Not selected · Not eligible · Withdrawn`

Vendors never see stage names, interviewer identities, scorecards, or internal notes.

## 4. Ownership & duplicate arbitration

**Why:** vendors are paid on placement; the org must be able to prove which vendor "owns" a candidate.

- **Scope** (org setting): `position` (ownership contested per position — default) or `organization` (first vendor to introduce the candidate owns them org-wide for the window).
- **Window** (org setting, default 180 days): ownership expires; a candidate re-submitted after the window is a fresh contest.
- **Rule:** owner = earliest `received_at` valid submission within scope+window. Later submissions get `ownership_status = duplicate` and generate a recruiter-visible flag (with both vendors' names and timestamps — org side sees everything).
- **Arbitration:** recruiters/admins can override to `arbitrated_owner` (e.g., first submission was a bare resume spam, second had candidate consent). Override requires a reason and is audited. This mirrors real-world dispute handling: the system's job is a defensible evidence trail, not automated adjudication.
- **Candidate consent field:** submissions carry `candidate_consent_confirmed` (vendor attests). Orgs can configure "no consent, no ownership" — a common contractual term that kills resume-spam disputes.

## 5. Notifications — pluggable channels, per organization

InterVU never assumes a notification provider. Channels are configured per org
(`settings.notifications` + registered webhook endpoints); a deployment can use
any SMTP server, Slack, Teams, custom endpoints, all of them, or none:

| Channel | Audience | Config | Status |
|---|---|---|---|
| Email (any SMTP via env; Mailpit in dev) | vendor users | `notifications.email_enabled` (default on) | ✅ |
| Slack incoming webhook | org channel | `notifications.slack_webhook_url` | ✅ |
| Microsoft Teams incoming webhook | org channel | `notifications.teams_webhook_url` | ✅ |
| Generic signed webhooks (Discord/Mattermost/Zapier/your systems) | anything | `POST /webhooks` — HMAC-SHA256 `X-InterVU-Signature`, per-endpoint event filter | ✅ |
| In-app portal visibility | vendors | always on — email off never hides a release | ✅ |

| Event | Notification |
|---|---|
| Position released to vendor | ✅ email to the vendor's active users the moment `visible_from` arrives (immediate for publish/manual release; tier unlocks caught by a DB-is-truth sweeper — `notified_at` makes it idempotent) + org channels |
| New submission accepted | ✅ org channels (`submission.created`) |
| Duplicate submission contest | ✅ org channels (`submission.duplicate_flagged`) |
| Identity match needs review | ✅ org channels (`match_review.queued`) |
| Candidate status changes to the owning vendor | ✅ durable email on Interviewing / Offered / Not selected (noise-controlled; earlier stages stay portal-only); daily digest option planned |
| Delivery log + retry/backoff | ✅ every send (all channels incl. email) is a `notification_delivery` row drained with exponential backoff (30s → 24h, 8 attempts → dead letter); `GET /notification-deliveries` is the log, `POST /notification-deliveries/{id}/retry` revives dead letters. A down channel delays a message, never loses it |
| Submission status change (coarse) | Email digest (immediate for `Offered`/`Not eligible`) |
| Position paused/closed with vendor's active candidates | Immediate email |
| Interview scheduled requiring candidate availability | Email with slots (vendor coordinates candidate in v1; candidate self-scheduling is out of scope) |

## 6. Org-side vendor management screens

- Vendor directory: tiers, contract windows, submission volume, conversion stats (submissions → interviews → hires) — this data quietly answers "which vendors are worth tier 1?"
- Per-position release panel: which vendors can see it, when each tier unlocks, manual release/early-release buttons, release history (audited).
- Duplicate arbitration inbox: contested (candidate, position) pairs with evidence timeline.
