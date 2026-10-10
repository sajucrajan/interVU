# Contributing to InterVU

Thanks for your interest! InterVU is a **working application** (milestones
M0–M3 complete, M4 mostly done — see the [roadmap](docs/07-roadmap.md#progress)),
and both code and design review are welcome.

## Ways to contribute

- **Code** — pick an issue labeled `good first issue` or `help wanted`. The `packages/matching-core` package (pure functions: normalizers, similarity, scoring) is the friendliest entry point: no DB, no framework, just well-specified functions and tests.
- **Design feedback** — open a *Design question* issue on anything in [`docs/`](docs/). Real-world experience with vendor/staffing workflows, VMS ownership disputes, or identity resolution is especially wanted.
- **Docs & i18n** — quickstart improvements, translations of UI strings.

## Development setup

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d    # postgres only (the one hard dep)
pnpm --filter @intervu/api db:migrate               # apply prisma migrations
pnpm --filter @intervu/api db:seed                  # demo org, hierarchy, vendors, positions
pnpm dev                                            # api (:4000) + web (:3000) on the host
```

App processes run on the host in dev (hot reload); only infra runs in Docker.
Optional services, started per profile:

| Profile | Adds | Needed when working on |
|---|---|---|
| `--profile mail` | Mailpit (SMTP :1025, inbox http://localhost:8025) | notifications |
| `--profile files` | MinIO (:9000, console :9001) | resume upload/download |
| `--profile app` | api + web as containers | deployment / Dockerfiles |

**No Docker?** Run a real Postgres from npm-downloaded binaries instead:

```bash
pnpm db:embedded                                    # terminal 1: postgres on :5432, data in .pgdata/
```

then run the migrate/seed/dev commands above as usual. The API reads
`DATABASE_URL` from the environment or `apps/api/.env`
(default `postgresql://intervu:intervu@localhost:5432/intervu` works for both
docker-compose and embedded). Copy `apps/api/.env.example` for the full list of
settings (SMTP, S3, `LOGIN_ORG_MODE`, `ERASURE_SALT`).

## Signing in while developing

`db:seed` prints every demo account; the full reference with roles, scopes and
what each one demonstrates is **[docs/10-demo-accounts.md](docs/10-demo-accounts.md)**.
All demo accounts use the password `intervu-demo`.

- Internal staff: http://localhost:3000/login
- Vendors: http://localhost:3000/vendor/login

For scripts and curl, dev header auth works outside production (see
`apps/api/src/tenancy/auth.guard.ts`) — vendors need the org header too, since
vendor access is organization-scoped:

```bash
curl http://localhost:4000/api/v1/positions \
  -H "x-intervu-org: acme" -H "x-intervu-user: recruiter@acme.test"
curl http://localhost:4000/api/v1/vendor/positions \
  -H "x-intervu-org: acme" -H "x-intervu-vendor-user: recruiter@talentbridge.test"
```

## Useful commands

```bash
pnpm typecheck                                   # all packages
pnpm test                                        # unit suites: matching-core (+ evals), api
pnpm --filter @intervu/api exec prisma migrate dev --name <change>
pnpm --filter @intervu/api exec prisma studio    # browse the database
```

## End-to-end checks

Two checks run against a real stack, in CI and on your machine. Both sign in as
every demo account (docs/10), so they catch what a unit test cannot: a rule
that is right for one role and wrong for another.

```bash
pnpm --filter @intervu/api db:seed:tenant-b       # a second organization, for cross-tenant checks
node tools/access-check.mjs                       # API: who may call what (stack running)
node tools/link-check.mjs                         # web: no link leads to a refusal (needs Playwright)
```

- **`access-check`** calls every endpoint as every account and checks each
  answer against docs/09 — permission, org-unit scope, panel seats — plus list
  leakage, refused writes, the vendor portal, and a second organization trying
  every record. **Adding or changing an endpoint means adding it here.**
- **`link-check`** follows every in-app link each account is offered, and fails
  on a refusal, a page stuck on "Loading…", or a refused API call behind a page.
  Playwright is not a workspace dependency; point `PLAYWRIGHT_FROM` at any
  directory whose `node_modules` holds it.

## Ground rules

- **Tenancy is sacred.** Vendor-visible queries must filter on **both** `organization_id` and `vendor_id` (docs/05 §1); org-side queries must respect entitlement scopes (docs/09). PRs adding endpoints must add them to `tools/access-check.mjs`.
- **Matching changes need evals.** Changes to `matching-core` must keep the CI eval above the precision floor — `precision@auto-link` must stay at 1.0 (see [docs/04](docs/04-candidate-matching.md)).
- **Never auto-merge candidate identities.** High-confidence *links* are fine; merging two existing master records is always a human decision and must stay reversible.
- **Migrations are append-only** once released.
- Conventional commits; PRs need a passing CI and one maintainer review.
- DCO: sign off your commits (`git commit -s`).

## How a change reaches `main`

`main` is protected — it takes no direct pushes, force-pushes or deletions. Every
change arrives as a pull request from a branch (or, for outside contributors, a
fork), and merges only once:

1. **CI is green.** Two required checks must pass — `build-and-test` (install,
   build, unit and eval suites) and `db-verify` (a fresh Postgres taken through
   migrate → seed → seed again, so migrations and the seed can't drift apart).
2. **A maintainer has approved it.** Pushing new commits to an approved PR
   dismisses the approval, so what gets merged is what was reviewed.
3. **The branch is up to date with `main`,** so the checks that passed ran
   against the code that actually lands.

CI also runs `access-check` and `link-check` (above) on every pull request.

Run `pnpm typecheck && pnpm test` locally first — it's the same ground CI covers,
and it's faster to find out on your machine.

## Code of conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Be kind.

## Security

Do **not** open public issues for vulnerabilities — see `SECURITY.md` for private disclosure.
