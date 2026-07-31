# InterVU

**Open-source interview & vendor-sourced hiring management platform.**

InterVU is built for organizations that run high volumes of interviews across many positions, where candidate profiles are sourced through multiple external **vendors** (staffing agencies). It solves the three problems that generic ATSs handle poorly:

1. **Candidate identity resolution** — the same candidate is often submitted by different vendors, for different positions, at different times. InterVU detects and links these into a single *candidate master record* using deterministic + probabilistic matching, with a human review queue for uncertain matches.
2. **Cross-team candidate history** — interview teams see the candidate's full history inside the organization before they interview: past applications, interview rounds, scorecards, outcomes, and do-not-hire flags — even if a different team interviewed them last year under a different vendor.
3. **Controlled vendor release** — a position can be opened to all vendors at once, or released in **tiers** (e.g., preferred vendors first, everyone else after 7 days), with vendor-scoped portals, submission ownership rules, and duplicate-submission arbitration.

## Core features

- **Organization workspace** — teams, positions, interview pipelines, scorecards, decisions.
- **Vendor portal** — each vendor gets its own login; vendors see only the positions released to them and only their own submissions. Vendors never see other vendors' candidates or internal feedback.
- **Tiered position release** — release policies per position: all-at-once, tiered with delays, or manual.
- **Candidate matching engine** — email/phone deterministic matching, fuzzy name/profile scoring, optional resume-embedding similarity, and a merge-review UI with full audit and un-merge.
- **Submission ownership & conflict rules** — first-valid-submission ownership with a configurable ownership window; duplicate submissions are flagged and arbitrated, not silently dropped.
- **Candidate history timeline** — every interaction with the candidate across all positions, teams and vendors, permission-filtered per viewer.
- **Audit-first** — every state change is logged; merges are reversible; GDPR-friendly retention and erasure.

## Status

✅ **Working implementation — milestones M0–M3 complete** (see [progress](docs/07-roadmap.md#progress)). What runs today:

- Session auth (org + vendor portals), org-unit hierarchy (verticals/units/teams), scoped entitlements incl. project-manager role
- Rich role postings: seniority, employment type, location policy, vendor-facing rate bands, skill matrix (must/good × proficiency × years), non-skill must-haves, rendered JD pages, posting form
- Tiered/manual/all-at-once vendor release with query-time visibility
- Vendor submissions with deterministic **and** probabilistic candidate matching: gmail-alias-proof identity resolution, trigram blocking, explainable scoring, human review queue, reversible master merges, CI-gated eval corpus
- First-valid-submission ownership with cross-vendor duplicate flagging and arbitration data
- Interviews with skill-matched panel suggestions, scorecards with hide-until-submitted feedback policy, decisions, do-not-hire flags, full cross-position candidate timelines
- Analytics dashboard (D3 sunburst of hierarchy → positions, funnel, vendor performance), white-label branding per org

**Not yet built:** background workers/queues (release notifications, re-match sweep), resume upload + parsing, webhooks, OIDC SSO, retention/erasure, app container images, Postgres RLS backstop. See the [roadmap](docs/07-roadmap.md).

## Quickstart (dev)

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d   # postgres (no Docker? pnpm db:embedded)
pnpm --filter @intervu/api db:migrate
pnpm --filter @intervu/api db:seed                 # prints demo accounts; password: intervu-demo
pnpm dev                                           # api :4000, web :3000
```

Then open http://localhost:3000 — sign in as `recruiter@acme.test` (org `acme`) or vendor `recruiter@talentbridge.test`.

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
