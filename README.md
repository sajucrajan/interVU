# InterVU

**Open-source interview & vendor-sourced hiring management platform.**

InterVU is built for organizations that run high volumes of interviews across many positions, where candidate profiles are sourced through multiple external **vendors** (staffing agencies). It solves the three problems that generic ATSs handle poorly:

1. **Candidate identity resolution** — the same candidate is often submitted by different vendors, for different positions, at different times. InterVU detects and links these into a single *candidate master record* using deterministic + probabilistic matching, with a human review queue for uncertain matches.
2. **Cross-team candidate history** — interview teams see the candidate's full history inside the organization before they interview: past applications, interview rounds, scorecards, outcomes, and do-not-hire flags — even if a different team interviewed them last year under a different vendor.
3. **Controlled vendor release** — a position can be opened to all vendors at once, or released in **tiers** (e.g., preferred vendors first, everyone else after 7 days), with vendor-scoped portals, submission ownership rules, and duplicate-submission arbitration.

## Core features

- **Organization workspace** — a hierarchy of verticals/units/teams, positions with full skill matrices, interview pipelines, scorecards, decisions, and an analytics dashboard.
- **Vendor portal** — a separate, internet-facing entry point (`/vendor/login`); vendors sign in **per client organization** and see only the positions released to them and their own submissions. Vendors never see other vendors' candidates or internal feedback.
- **Scoped entitlements** — roles attach at any level of the hierarchy (org-wide, vertical, or single team) and inherit downward; interviewers are scoped by panel assignment rather than the tree.
- **Tiered position release** — release policies per position: all-at-once, tiered with delays, or manual.
- **Candidate matching engine** — email/phone deterministic matching, fuzzy name/profile scoring, optional resume-embedding similarity, and a merge-review UI with full audit and un-merge.
- **Submission ownership & conflict rules** — first-valid-submission ownership with a configurable ownership window; duplicate submissions are flagged and arbitrated, not silently dropped.
- **Candidate history timeline** — every interaction with the candidate across all positions, teams and vendors, permission-filtered per viewer.
- **Audit-first** — every state change is logged; merges are reversible; GDPR-friendly retention and erasure.

## Status

✅ **Working implementation — M0–M3 complete, M4 mostly done** (see [progress](docs/07-roadmap.md#progress)). What runs today:

- Session auth (org + vendor portals), org-unit hierarchy (verticals/units/teams), scoped entitlements incl. project-manager role
- Rich role postings: seniority, employment type, location policy, vendor-facing rate bands, skill matrix (must/good × proficiency × years), non-skill must-haves, rendered JD pages, posting form
- Tiered/manual/all-at-once vendor release with query-time visibility
- Vendor submissions with deterministic **and** probabilistic candidate matching: gmail-alias-proof identity resolution, trigram blocking, explainable scoring, human review queue, reversible master merges, CI-gated eval corpus
- First-valid-submission ownership with cross-vendor duplicate flagging and arbitration data
- Interviews with skill-matched panel suggestions, scorecards with hide-until-submitted feedback policy, decisions, do-not-hire flags, full cross-position candidate timelines
- Analytics dashboard (D3 sunburst of hierarchy → positions, funnel, vendor performance), white-label branding per org
- Pluggable notifications: per-org channels (any SMTP, Slack, Teams, HMAC-signed webhooks) with durable delivery — retry/backoff, dead letters, delivery log
- Resume upload to any S3-compatible store, GDPR erasure with matching-safe tombstones, daily re-match sweep, containerized deployment

**Not yet built:** OIDC SSO, in-app notification centre, Postgres RLS backstop, published container images, Helm chart. See the [roadmap](docs/07-roadmap.md).

## Quickstart

**Just want to try it?** Everything in containers, no Node toolchain needed:

```bash
docker compose -f infra/docker-compose.yml --profile app up -d --build
```

The API migrates the database on boot. Seed the demo data once with
`docker compose -f infra/docker-compose.yml exec api ./node_modules/.bin/tsx prisma/seed.ts`,
then open http://localhost:3000.

**Developing?** Run infra in Docker and the apps on the host for hot reload:

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d   # postgres (no Docker? pnpm db:embedded)
pnpm --filter @intervu/api db:migrate
pnpm --filter @intervu/api db:seed                 # prints demo accounts; password: intervu-demo
pnpm dev                                           # api :4000, web :3000
```

Optional services: `--profile mail` (Mailpit inbox at :8025), `--profile files` (MinIO for resumes).

## Demo accounts

**Every seeded account uses the password `intervu-demo`.** Organization slug is
`acme` (auto-resolved on a single-org deployment, so you usually just type email
+ password). Full reference incl. what each role can and cannot see:
**[docs/10-demo-accounts.md](docs/10-demo-accounts.md)**.

Internal staff → **http://localhost:3000/login**

| Email | Role | Scope | What it demonstrates |
|---|---|---|---|
| `admin@acme.test` | org_admin | org-wide | Everything: settings, vendors, erasure, webhooks |
| `recruiter@acme.test` | recruiter | org-wide | The main workflow — post roles, arbitrate duplicates, resolve match reviews |
| `hm.eng@acme.test` | hiring_manager | Engineering vertical | Sees 8 of 11 positions; blocked from the review queue |
| `pm.gtm@acme.test` | project_manager | GTM vertical | Read-only, 3 positions — scope isolation |
| `pm.platform@acme.test` | project_manager | Platform team | Read-only, 4 positions — narrowest scope |
| `interviewer1@acme.test` | interviewer | assignment-only | **0 positions**, but 2 assigned interviews at `/interviews` |
| `interviewer2@acme.test` | interviewer | assignment-only | Pair with interviewer1 to see the hide-until-submitted feedback policy |

Vendors (external agencies) → **http://localhost:3000/vendor/login**

| Email | Vendor | Tier | Positions visible |
|---|---|---|---|
| `recruiter@talentbridge.test` | TalentBridge | 1 | 10 — tier 1 sees tiered releases immediately |
| `recruiter@hireworks.test` | HireWorks | 2 | 8 — tier 2 unlocks later |
| `recruiter@staffpro.test` | StaffPro | 2 | 8 |

## Design docs

The full design lives in [`docs/`](docs/):

| Doc | Contents |
|---|---|
| [01-requirements.md](docs/01-requirements.md) | Deep requirements analysis, actors, user stories, edge cases |
| [02-architecture.md](docs/02-architecture.md) | System architecture, tech stack, multi-tenancy, background jobs |
| [03-data-model.md](docs/03-data-model.md) | Entity-relationship model and schema |
| [04-candidate-matching.md](docs/04-candidate-matching.md) | Identity-resolution engine design |
| [05-vendor-portal-and-release.md](docs/05-vendor-portal-and-release.md) | Vendor portal, tiered release, ownership rules |
| [06-api-design.md](docs/06-api-design.md) | REST API surface, auth, webhooks |
| [07-roadmap.md](docs/07-roadmap.md) | Milestones, MVP cut, governance |
| [08-database-strategy.md](docs/08-database-strategy.md) | ADR: Postgres core, any cloud/on-prem provider, warehouse export |
| [09-entitlements.md](docs/09-entitlements.md) | Authorization: role@scope grants, hierarchy inheritance, contextual access |
| [10-demo-accounts.md](docs/10-demo-accounts.md) | **Test accounts for every role**, seeded data, things to try, reset instructions |

## Stack (see [architecture doc](docs/02-architecture.md) for rationale)

- **Monorepo:** pnpm workspaces + Turborepo
- **API:** NestJS (TypeScript) + Prisma
- **Web:** Next.js (one app, two experiences: org workspace & vendor portal) + D3 for analytics
- **Database:** PostgreSQL (`pg_trgm` powers fuzzy matching) — bring any provider: Azure Database for PostgreSQL / Cosmos DB for PostgreSQL, AWS RDS/Aurora, GCP Cloud SQL, self-hosted/on-prem, or the bundled container ([why Postgres-only](docs/08-database-strategy.md))
- **Jobs/queues (planned, M4):** BullMQ + Redis — behind `--profile full` in compose until wired
- **Files (planned, M4):** S3-compatible storage (MinIO for self-hosting) — behind `--profile full`
- **Deploy:** dev infra via Docker Compose (`pnpm db:embedded` runs Postgres from npm binaries if you have no Docker); containerized app images + Helm are M4

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The [roadmap](docs/07-roadmap.md) lists milestone-scoped issues; design feedback via GitHub Discussions is as valuable as code right now.

## License

Apache-2.0 (proposed — see [07-roadmap.md § License](docs/07-roadmap.md#license)).
