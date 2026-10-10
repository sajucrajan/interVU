# 07 — Roadmap, MVP Cut & Open-Source Setup

## Progress

_Last updated 2026-10-10._ M0–M3 are **built and verified**; M4 is mostly done,
and a large body of work beyond the original roadmap has landed since.

| Milestone | Status | Notes |
|---|---|---|
| M0 skeleton | ✅ done* | monorepo, CI, compose, session auth, tenancy+entitlements, audit, seed. *RLS backstop still deferred (see M0 below) |
| M1 MVP loop | ✅ done | positions+releases (all 3 policies), vendor portal, deterministic matching, ownership, timeline |
| M2 interviews | ✅ done | rounds+panels, scorecards w/ feedback policy, flags, decisions, timeline UI |
| M3 matching | ✅ done | fuzzy scoring, trgm blocking, review queue, reversible merges, eval corpus in CI, daily re-match sweep |
| M4 integrations | 🔨 mostly done | landed: **pluggable notifications** (SMTP, Slack, Teams, HMAC-signed webhooks) with **durable delivery**, **vendor status-change emails**, **resume upload** (S3-compatible, or `RESUME_STORAGE=extract_only` with PDF/DOCX text extraction), **GDPR erasure with tombstones**, **daily re-match sweep**, **container images + `--profile app` full stack**, **vendor funnel stats** (both sides, one computation). Pending: OIDC SSO, published images/Helm, RLS backstop, warehouse export |
| Hiring workflow (beyond the roadmap) | ✅ | **sourcing channels** (vendor / hybrid / direct, with the guard against stranding agency candidates), **screening screen** and the screening-vs-panel rejection split, **panel debrief** with competency matrix, divergence call-out and a composed **feedback packet** for the agency, **offers and dropouts**, the **interview room**, a shared **question bank** with votes and spread, drag-and-drop **pipeline board** with aging and SLAs |
| Product surface | ✅ | Ledger design system with a live atoms page (`/design`), dashboard / board / dossier / analytics rebuilt to the design, command palette, responsive rail, read-only **position brief** for interviewers and agencies, **vendor portal rail and Performance page**, **custom roles** plus a read-only `vendors.view_performance` permission, white-label branding, D3 sunburst explorer |
| Roles in practice | ✅ | **Today per role** (a line on what the role is for; read-only roles see where hiring stands instead of a to-do list), interviewers' **assignment grant** to their candidates (docs/09 §4.2), filed scorecards and the panel's visible on My interviews and in the room, **scorecard reminders** by email, and refusals rendered as pages that say who a screen is for |
| Personas | ✅ | One person, several jobs, one at a time (docs/09 §7): a persona per role plus Interviewer for anyone on a panel; chosen at sign-in and remembered (or asked every time); the server enforces only the active persona, panel seats included; Today and the account menu flag work waiting in the others; every audit row names the persona |
| Access assurance | ✅ | `tools/access-check.mjs` checks every endpoint against docs/09 for every demo account and across two organizations; `tools/link-check.mjs` follows every link each account is offered. Both run in CI. Found and fixed on the way: unchecked scorecard and dossier reads, unscoped panel suggestions |
| Public demo | ✅ | free deployment on **Neon + Render** from a Blueprint, migrations serialised in CI, **nightly reset**, the `/demo` guide and `/how-it-works` (read live from the API), a seed whose data respects its own release rules and carries realistic history |

CI runs on every pull request and on `main`: build, unit tests (including the
matching eval gates), a `db-verify` job that migrates and seeds twice, the
`access-check` API suite and the `link-check` crawl.

## 1. Milestones

### M0 — Skeleton (repo bootstrap)
Monorepo scaffolding, CI (lint/test/build), docker-compose, auth (org + vendor sessions), tenancy guards, audit log plumbing, seed script. *Exit: `docker compose up` → log in as demo org admin and demo vendor.* (Postgres **RLS** was scoped here but deferred — enforcement today is the guard + query layer; RLS remains the planned defence-in-depth backstop.)

### M1 — MVP: the differentiating loop end-to-end
The MVP is deliberately the *unusual* part of the product — the part no free ATS gives you:

- Positions (create/publish/pause/close) with **all three release policies** incl. tiered scheduler
- Vendor portal: released positions, profile submission with resume upload, own-submission tracking, coarse statuses
- Matching: normalization + **deterministic** matching + identity accretion + pre-flight duplicate probe
- Ownership rules (scope, window, duplicate flags, arbitration)
- Candidate master + **timeline** (submissions, stages, decisions)
- Simple pipeline stages + decisions (no interview scheduling yet — record outcomes)
- Email notifications (release, status change)

*Exit: two demo vendors submit the same candidate to two positions; the org sees one candidate, full history, and a duplicate flag; tier-2 vendor sees the position only after the delay.*

### M2 — Interviews & feedback
Interview rounds, panels, ICS invites, scorecard templates/responses, feedback-visibility policy, do-not-hire flags, interviewer home screen, candidate packet view.

### M3 — Probabilistic matching
`matching-core` fuzzy pipeline (blocking, scoring, thresholds), review queue UI with feature breakdown, merge/un-merge, nightly re-match sweep, matching quality dashboard, synthetic eval corpus in CI.

### M4 — Integrations & scale-out
Webhooks + delivery log, PATs, OIDC SSO adapter, retention/erasure workflows (tombstones), reporting (vendor funnel stats, time-to-hire), **analytics export to warehouses** (Snowflake/BigQuery/SQL Server — see [08-database-strategy.md](08-database-strategy.md)), Helm chart, optional plugins (pgvector embeddings, LLM review-assist, better resume parsing).

### Later / community-driven
Candidate self-scheduling, offer management, multi-language UI, analytics warehouse export, mobile-friendly interviewer app.

## 2. License

**Recommendation: Apache-2.0.** Maximizes adoption and contribution for a B2B self-hosted tool; patent grant matters to enterprise users. Choose **AGPL-3.0** instead only if preventing closed-source SaaS forks matters more than adoption breadth to you — decide before the first external contribution, and add a DCO (`Signed-off-by`) requirement either way so relicensing stays possible early.

## 3. Repo & community setup checklist

- [x] `LICENSE` (Apache-2.0), `CODE_OF_CONDUCT.md` (Contributor Covenant), `CONTRIBUTING.md`, `SECURITY.md` (private disclosure), `.github/ISSUE_TEMPLATE/` (bug, feature, design question), PR template with checklist
- [ ] GitHub Discussions on (design decisions happen in the open; docs/ PRs welcome) — a repository setting; until then the *Design question* issue template does the job
- [x] CI: typecheck (via build), unit, **cross-tenant leakage suite** (`access-check`), matching eval, link crawl — still missing: a lint step and a docker build
- [ ] `good first issue` + `help wanted` labels seeded from milestone tasks (normalizers, similarity functions, and UI components are ideal first issues — pure, small, well-specified)
- [x] Demo instance (reset nightly) + seed data so evaluators see the matching engine without setup
- [ ] Docs site (this `docs/` folder rendered via a static site generator) with a 5-minute quickstart
- [ ] Versioning: SemVer, conventional commits, release automation (changesets) — `main` is protected already

## 4. Suggested first issues (M0/M1 slice examples)

1. `matching-core`: email normalizer with gmail dot/plus rules + property tests
2. `matching-core`: phone normalizer (libphonenumber wrapper) + fixtures for IN/US/UK formats
3. API: `position_vendor_release` visibility predicate + query-layer tests
4. Worker: tiered-release delayed job with DB-as-truth reconciliation sweep
5. Web: vendor position list page (released-only) from OpenAPI types
6. Seed: synthetic candidate generator with planted duplicate clusters

## 5. Key design decisions (ADR summary)

| # | Decision | Rationale | Doc |
|---|---|---|---|
| 1 | Modular monolith, not microservices | Contributor velocity, one-command self-host | [02](02-architecture.md) |
| 2 | Candidate ≠ submission; golden record + identity accretion | The entire dedup/history requirement hinges on it | [03](03-data-model.md) |
| 3 | Auto-link at high confidence, human-only master merges, reversible merges | Wrong merges are the worst failure mode | [04](04-candidate-matching.md) |
| 4 | DB-is-truth release visibility; jobs only notify | Scheduler failures must not affect fairness of tiered release | [05](05-vendor-portal-and-release.md) |
| 5 | Separate vendor route tree + DTOs, RLS backstop | Cross-vendor leakage must be structurally impossible | [02](02-architecture.md), [06](06-api-design.md) |
| 6 | Ownership = earliest valid submission, configurable scope/window, human arbitration | Matches real staffing-industry contracts; system provides evidence, not verdicts | [05](05-vendor-portal-and-release.md) |
| 7 | Postgres-only search/matching in core; embeddings/LLM as optional plugins | Zero mandatory SaaS deps for self-hosters | [02](02-architecture.md), [04](04-candidate-matching.md) |
