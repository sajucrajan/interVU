# Contributing to InterVU

Thanks for your interest! InterVU is in the design/bootstrap phase, so **design review is as valuable as code** right now.

## Ways to contribute

- **Design feedback** — open a GitHub Discussion on anything in [`docs/`](docs/). Real-world experience with vendor/staffing workflows, VMS ownership disputes, or identity resolution is especially wanted.
- **Code** — pick an issue labeled `good first issue` or `help wanted`. The `packages/matching-core` package (pure functions: normalizers, similarity, scoring) is the friendliest entry point: no DB, no framework, just well-specified functions and tests.
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
Redis and MinIO aren't needed yet — when working on queues or file uploads,
start them with `--profile full`.

**No Docker?** Run a real Postgres from npm-downloaded binaries instead:

```bash
pnpm db:embedded                                    # terminal 1: postgres on :5432, data in .pgdata/
```

then run the migrate/seed/dev commands above as usual. The API reads
`DATABASE_URL` from the environment or `apps/api/.env`
(default `postgresql://intervu:intervu@localhost:5432/intervu` works for both
docker-compose and embedded).

`db:seed` prints demo accounts. Until real session auth lands, requests authenticate
with dev headers (see `apps/api/src/tenancy/dev-auth.guard.ts`):

```bash
curl http://localhost:4000/api/v1/positions \
  -H "x-intervu-org: acme" -H "x-intervu-user: recruiter@acme.test"
curl http://localhost:4000/api/v1/vendor/positions \
  -H "x-intervu-vendor-user: recruiter@talentbridge.test"
```

## Ground rules

- **Tenancy is sacred.** Any query touching vendor-visible data must go through the tenancy-scoped repository layer. PRs adding endpoints must include cross-tenant leakage tests.
- **Matching changes need evals.** Changes to `matching-core` must keep the CI eval above the precision floor (see [docs/04](docs/04-candidate-matching.md)).
- **Migrations are append-only** once released.
- Conventional commits; PRs need a passing CI and one maintainer review.
- DCO: sign off your commits (`git commit -s`).

## Code of conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Be kind.

## Security

Do **not** open public issues for vulnerabilities — see `SECURITY.md` for private disclosure.
