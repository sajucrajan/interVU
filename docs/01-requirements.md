# 01 — Requirements Analysis

This document decomposes the original requirement statement, surfaces the *implicit* requirements hiding inside it, and defines actors, user stories, and edge cases.

## 1. The stated requirements, decomposed

> *"An organization that does lots of interviews for various positions. The organization may open up positions to different vendors. Vendors may bring the same candidate for different positions. If it's the same candidate, the history of the candidate must be visible to the teams interviewing. We need some matching. Vendors need their own login for adding profiles for an open position. A position may open to all vendors at the same time, or open to other vendors after a certain time."*

| # | Stated requirement | What it actually implies |
|---|---|---|
| R1 | High interview volume, many positions | Pipeline/stage management, interview scheduling, scorecards, and reporting must scale; bulk operations matter |
| R2 | Positions open to different vendors | Vendor is a first-class entity with a relationship to the org (contracts, tiers); per-position vendor visibility |
| R3 | Same candidate via multiple vendors/positions | **Identity resolution**: candidates must be modeled independently of submissions; a submission links (vendor, position, candidate) |
| R4 | Candidate history visible to interviewing teams | A candidate *master record* with a cross-position timeline; permission model deciding who sees what (vendors must NOT see this) |
| R5 | "Some matching" | A matching engine: deterministic + fuzzy + (optionally) semantic; confidence thresholds; a human review queue, because auto-merge errors are costly |
| R6 | Vendor logins to add profiles | Separate vendor portal with hard tenant isolation: vendor A must never see vendor B's candidates, submissions, or even that vendor B exists on a position |
| R7 | Timed/tiered vendor release | Release policies + a scheduler; notifications to vendors when a position becomes visible to them |

## 2. Implicit requirements (not stated, but unavoidable)

These fall out of the stated requirements the moment real usage begins:

1. **Submission ownership conflicts.** If Vendor A submits Jane for Position P on Monday and Vendor B submits the same Jane on Wednesday, who gets the placement fee? Every staffing-vendor ecosystem fights about this. The system must record *first valid submission* per (candidate, position) — and usually per (candidate, org) within an **ownership window** (commonly 6–12 months, configurable) — and flag later submissions as duplicates rather than silently rejecting them (the org may still want the candidate; the *vendors* need arbitration).
2. **Vendor privacy walls.** Vendors see: positions released to them, their own submissions, and a coarse status (e.g., "In process", "Rejected", "Offered"). They must not see internal feedback, interviewer names, other vendors, or the candidate's history with the org.
3. **Feedback integrity.** With many interviewers per candidate, later interviewers should optionally not see earlier feedback until they submit their own (bias prevention). Configurable per org.
4. **Do-not-hire / flags.** History exists largely so teams don't re-interview someone rejected for cause 3 months ago. Flags need a reason, an author, an expiry, and restricted visibility.
5. **Merge is dangerous.** A wrong merge leaks one person's history into another person's interviews. Merges must be audited, attributed, and reversible (un-merge), and uncertain matches must go to humans.
6. **Auditability.** Hiring decisions have legal exposure. Every state transition (submission, stage change, feedback, decision, merge, release) needs an immutable audit log.
7. **Data protection.** Candidate PII → GDPR/DPDP-style obligations: consent capture at submission, retention policies, right-to-erasure that coexists with the ownership/dedup requirements (erasure must keep a *tombstone hash* so a re-submitted erased candidate doesn't silently become "new" — see [04-candidate-matching.md §7](04-candidate-matching.md)).
8. **Notifications.** Vendors need to know when positions open to them and when their candidates change status; interviewers need interview assignments and feedback reminders.
9. **Resume handling.** File upload, virus scanning, parsing (name/email/phone extraction feeds the matcher), versioning (the same candidate's resume differs per vendor — keep all of them, attached to the submission, with the master record pointing at the latest).
10. **Multi-org from day one?** The requirement describes one organization, but an open-source project will be self-hosted by many orgs, and some hosts will want one deployment serving several orgs. Model `organization_id` on everything from the start; single-org installs just have one row.

## 3. Actors & roles

### Organization side

Organizations are internally hierarchical: **verticals/units contain other units or teams** (e.g., *Org → Engineering vertical → Platform team*), to any depth. Positions belong to teams; role scopes can attach at any level of the tree and apply to all descendants (a vertical-level hiring manager covers every team beneath it).

| Role | Capabilities |
|---|---|
| **Org Admin** | Org settings, vendor management, user management, release policies, merge review, audit access |
| **Recruiter / Coordinator** | Create positions, manage releases, manage pipelines, schedule interviews, communicate with vendors, resolve duplicate flags |
| **Hiring Manager** | Owns positions for their team/vertical scope; sees full candidate history; makes decisions |
| **Project Manager** | Read-only funnel visibility (positions, submission statuses) for the verticals/units/teams they are scoped to |
| **Interviewer** | Sees assigned interviews + candidate history (per visibility policy); submits scorecards |

Roles attach at a **scope** — the whole org or any node of the unit hierarchy — and apply to all descendants; a user can hold several scoped roles at once. Full model: [09-entitlements.md](09-entitlements.md).

### Vendor side
| Role | Capabilities |
|---|---|
| **Vendor Admin** | Manages the vendor's own users; sees all of the vendor's submissions across positions |
| **Vendor Recruiter** | Sees released positions; submits candidate profiles; tracks own submissions' coarse status |

### System
| Role | Capabilities |
|---|---|
| **Matching engine** | Runs on every submission; links/flags/queues candidate identities |
| **Release scheduler** | Flips vendor visibility per release policy; fires notifications |

## 4. Core user stories

### Positions & release
- As a **recruiter**, I create a position with description, team, openings count, and pipeline template.
- As a **recruiter**, I choose a release policy: *all vendors now*, *tier 1 now → tier 2 after N days → tier 3 after M days*, or *manual per-vendor release*.
- As a **vendor recruiter**, I see a position appear in my portal the moment it is released to my vendor, and I'm notified.
- As a **recruiter**, I can pause/close a position; vendors see it as closed and can no longer submit.

### Submissions & matching
- As a **vendor recruiter**, I submit a profile (name, email, phone, resume, notes, expected rate) against an open position.
- As the **system**, on every submission I run identity resolution: link to an existing candidate master, create a new one, or queue for review.
- As a **recruiter**, I see a *duplicate flag* when a submission matches a candidate already active on this position (or within the ownership window), with the competing vendor and dates, and I arbitrate.
- As an **org admin**, I review uncertain matches side-by-side and merge / keep-separate; I can un-merge with full history restoration.

### Skills & interview panels
- As a **recruiter**, I tag a position with **must-have** and **good-to-have** skills.
- As a **team/vertical/org admin**, I define **interview panels** — named pools of panelists tagged with the technologies they can assess. Panels attach at any level of the unit hierarchy (org-wide, vertical, or team) and cover that scope's positions, following the same inheritance as entitlements.
- As a **recruiter scheduling an interview**, I get **ranked panelist suggestions**: members of in-scope panels whose skills overlap the position's (must-haves weigh double).

### White-labeling
- The product is always *InterVU*, but each organization's workspace wears the **organization's name** and optional branding (accent color, display label) configured by org admins.

### Interviews & history
- As a **hiring manager**, before any interview I open the candidate's timeline: every past submission (which vendor, which position, when), every interview round, scorecards, outcomes, and flags.
- As an **interviewer**, I get my assignment, see the candidate packet (resume + history per policy), and submit a structured scorecard.

### The interviewer's screen (`/interviews`)

Grouped by what the viewer must **do** — *Waiting on you* / *Upcoming* /
*Filed* — rather than by date. An unfiled scorecard blocks a whole panel's
debrief, so burying it under next week's calendar is how it stays unfiled. The
three groups partition the list: filing early for a future round is legitimate,
and that row belongs under *Filed* only.

The scorecard collects **per-competency ratings against the position's own
skill matrix**, which is what the debrief's competency matrix is built from —
scorecard and job description cannot drift apart, because both read the same
rows.

- **Nothing is pre-selected, and blank stays blank.** A competency the round
  did not probe is recorded as *not assessed*, which the debrief renders
  differently from a low score. Defaulting the scale to its midpoint would
  manufacture agreement nobody expressed.
- **Panel filing state is visible; panel content is not.** The row shows
  `2/3 filed` — knowing you are the last one outstanding is useful pressure
  and reveals nothing. Seeing a colleague's *rating* before you write your own
  is what hide-until-submitted exists to prevent.
- As a **recruiter**, I move candidates through pipeline stages and record decisions; vendors see only the coarse status mapping.

### Vendor experience
- As a **vendor admin**, I invite my recruiters; only my vendor's data is ever visible to us.
- As a **vendor recruiter**, I'm told at submission time if my candidate is a duplicate *for this position* ("already in process via another source" — without revealing which source).

## 5. Edge cases the design must survive

| Edge case | Required behavior |
|---|---|
| Same vendor re-submits the same candidate to the same position | Idempotent: update, don't duplicate |
| Two vendors submit the same candidate to the same position minutes apart | Deterministic ordering by received timestamp; second flagged duplicate |
| Same candidate, different email/phone per vendor | Fuzzy matching catches it or review queue does; both identities retained on the master record |
| Candidate legitimately shares a name+employer with another person | Thresholds must not auto-merge on name alone; review queue; merge requires corroborating identifiers |
| Vendor submits to Position A; candidate later applies to Position B via another vendor after tier-2 release | History from Position A visible to Position B's team; ownership evaluated per configured scope |
| Position released to tier 2 while tier 1 vendor is mid-submission | Releases only ever *add* visibility; no revocation mid-flight |
| A merged candidate turns out to be two people | Un-merge restores both masters and re-links submissions/interviews to the correct one |
| Candidate requests erasure, then is re-submitted next month | PII deleted; salted identifier hashes kept as tombstone; re-submission creates a fresh record but the org can see "a previously erased record existed" (no PII) |
| Vendor contract terminated mid-position | Vendor loses portal visibility; historical submissions remain (attributed) for audit and ownership |

## 6. Non-functional requirements

- **Isolation:** vendor-scoped and org-scoped data access enforced at the query layer (not just UI), with automated tests for cross-tenant leakage.
- **Scale target (initial):** ~50k candidates, ~500 open positions, ~100 vendors, ~200 concurrent users per org. Postgres handles this comfortably; matching is the only component that needs care (blocking keys, not O(n²)).
- **Auditability:** append-only audit log; merges reversible.
- **Self-hostable:** single `docker compose up` for evaluation; no mandatory external SaaS dependencies (LLM-based matching/parsing strictly optional and pluggable).
- **Accessibility & i18n:** UI strings externalized from day one; RTL-safe layout.
- **API-first:** everything the UI does is a documented REST endpoint; webhooks for integrations.

## 7. Explicitly out of scope (v1)

- Offer management / e-signature, background checks, onboarding
- Candidate self-service portal (candidates are represented by vendors in this model)
- Payroll/invoicing between org and vendors (we record ownership; billing happens elsewhere)
- Video interviewing (integrate via links; don't build)
