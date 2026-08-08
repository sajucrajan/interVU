# 12 — Deployment walkthrough, step by step

Getting InterVU onto a public URL for free: **Neon** for Postgres, **Render**
for the two services. Allow about 40 minutes the first time, most of it
waiting for builds.

`docs/11` explains *why* each setting is what it is. This page is the steps.

> **On console labels.** Neon and Render redesign their dashboards regularly,
> so a label here may read slightly differently by the time you follow it. The
> *values* come from this repository and will not drift.

You need: a GitHub account with this repo, and an email address. No card.

> **Why not Koyeb?** Its free tier allows one service per organization and
> InterVU needs two. It also closed its free Starter tier to new accounts in
> early 2026. Render permits several free web services.

---

## What you are building

```
  browser ──▶ intervu-web (Next.js, Render)
                  │  rewrites /api/v1/* to ↓
              intervu-api (NestJS, Render) ──▶ Postgres (Neon)
```

The browser only ever talks to the web service. That is deliberate — see
*Why the proxy* at the end.

---

## Step 1 — The database (Neon)

1. Sign up at **[neon.tech](https://neon.tech)**, GitHub sign-in is quickest.
2. **Create project**:
   - **Name:** `intervu`
   - **Postgres version:** **17** (or 16). Local dev runs Postgres 16 and
     Prisma 6.2 is certified against 16/17. Nothing here needs 18, and a
     version you cannot reproduce locally is a bad place to debug.
   - **Region:** **AWS US East 1 (N. Virginia)** — pair it with Render's
     Virginia region. A page render makes several database round trips, so
     API↔database latency matters more than your own distance to either.
   - **Enable Neon Auth:** **off.** InterVU has its own session auth; this
     would add tables nothing reads.
3. **Connect** (green button, top of the left sidebar). In the dialog leave
   branch `production`, database `neondb`, role `neondb_owner`, and keep
   **Connection pooling on** (it is by default).
4. Copy the string. Check it contains **`-pooler`**:

   ```
   postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
                                                └── this ──┘
   ```

   If it is missing, type it in: straight after the endpoint ID, before the
   first dot. Pooled matters because Render services sleep and reconnect in
   bursts, which exhausts the direct endpoint's connection limit.
5. **Save it somewhere.** Neon shows the password once.

✅ *Verify it, in your own terminal:*

```
docker run --rm postgres:16 psql 'YOUR_STRING' -c 'select version();'
```

A `PostgreSQL 17.x` line back means you are done. This fails in two seconds;
a bad string fails five minutes into a Render build with a worse message.

**Do not** create tables, run SQL, or enable `pg_trgm` by hand. The API runs
`prisma migrate deploy` on every start and builds the schema itself, extension
included.

---

## Step 2 — Both services (Render Blueprint)

`render.yaml` in the repository root already carries every setting — Dockerfile
paths, build contexts, the health check path, ports, and the environment. You
supply three values it deliberately does not store.

1. Sign up at **[render.com](https://render.com)** with GitHub.
2. **New** → **Blueprint**. Pick this repository, branch `main`.
3. Render reads `render.yaml`, shows two services, and prompts for a
   **Blueprint name** (`intervu`), the **branch** (`main`), and one value:

   | Prompt | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon string |

4. **Apply**. Both services build; 5–10 minutes the first time.

**Render appends a suffix when a service name is already taken globally** —
`intervu-web` became `intervu-web-lby9`. The cross-references in `render.yaml`
(`WEB_ORIGIN` and `API_PROXY_TARGET`) hold the URLs of an existing deployment,
so on a *fresh* one you must update them to the URLs Render actually assigns
and let both services redeploy. Editing the file is better than editing the
dashboard: the Blueprint syncs from `main`, so the repo stays the source of
truth.

✅ *Check:* `<api-url>/healthz` returns `{"status":"ok","service":"intervu-api"}`.
The web URL will load but have no data yet.

> **If the Blueprint has trouble**, create both services by hand: **New** →
> **Web Service** → this repo → **Docker**, then per service —
> **API:** Dockerfile `./apps/api/Dockerfile`, root directory blank, health
> check `/healthz`, env `DATABASE_URL`, `NODE_ENV=production`, `PORT=4000`,
> `RESUME_STORAGE=extract_only`.
> **Web:** Dockerfile `./apps/web/Dockerfile`, root directory blank, health
> check `/`, env `NEXT_PUBLIC_API_URL=/api/v1`, `NEXT_PUBLIC_DEMO_MODE=true`,
> `NEXT_PUBLIC_DEMO_ORG=acme`, `NEXT_PUBLIC_DEMO_PASSWORD=intervu-demo`,
> `API_PROXY_TARGET=<api url>`.
> Render exposes a service's environment variables to its Docker build as
> build arguments, which is why the `NEXT_PUBLIC_*` values work as plain env
> vars here.

---

## Step 3 — Seed the demo data

Migrations run in CI, not on API start (see *How migrations work* below), so
after the first deploy the database is still empty.

1. GitHub → your repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**
   - **Name:** `DEMO_DATABASE_URL`
   - **Value:** the same pooled Neon string
2. **Actions** tab → **Reset demo data** → **Run workflow** → **Run workflow**
3. ~2 minutes. A green tick means done.

The same job runs nightly at 03:00 UTC. The demo password is public in
`seed.ts` on purpose so visitors can explore; the nightly reset is what keeps
anyone's changes temporary.

---

## Step 4 — Point the services at each other

Only needed if Render assigned URLs different from the ones in `render.yaml`.
Edit those two `value:` lines on `main` and let the Blueprint sync, or set them
in the dashboard under each service's **Environment**:

- **intervu-web** → `API_PROXY_TARGET` = the **API** URL, no trailing slash
- **intervu-api** → `WEB_ORIGIN` = the **web** URL

Changing `API_PROXY_TARGET` triggers a rebuild of the web service. That is
necessary, not incidental — it is read when the bundle is built.

✅ *Test:* `<web-url>/api/v1/auth/me` should return **401**, not 404. A 401
means the proxy reached the API and the API said "not signed in", which is
correct. A 404 means the request never left the web service.

---

## Done. What to look at

| Check | Expected |
|---|---|
| `<web-url>/demo` | six personas, one-click sign-in |
| Sign in as Riley | dashboard with a populated queue |
| **Analytics**, bottom | *Where hires come from*, with real figures |
| **Pipeline** | source chips, aging colours, 2 breached of 28 |
| `<web-url>/vendor/login` as `recruiter@talentbridge.test` | vendor portal, own submissions only |

---

## When something is wrong

**Pages load but have no data, and sign-in bounces straight back.**
`API_PROXY_TARGET` is unset, wrong, or has a trailing slash — and remember it
needs a **rebuild**, not just a restart.

**`/demo` returns 404 on the deployed site but works locally.**
`NEXT_PUBLIC_DEMO_MODE` did not reach the build. Confirm it is on the **web**
service and redeploy with **Clear build cache**.

**The API keeps restarting.**
Health check path. It must be `/healthz` — `/` is a 404 because everything
lives under `/api/v1`.

**Build fails on a missing `pnpm-lock.yaml` or workspace package.**
Root directory is set to `apps/api` or `apps/web`. It must be blank (the
repository root).

**Login returns 201 and then everything is logged out.**
The browser is reaching the API directly instead of through the proxy.
`onrender.com` is on the Public Suffix List, so the two services are different
*sites* and the `sameSite: "lax"` cookie is never sent between them.

**First visit takes ~50 seconds.**
Free services sleep after 15 minutes idle. The dashboard fires several requests
at once, so a cold visit looks broken before it looks slow.

**Services suspended mid-month.**
750 instance-hours per month is a **workspace** pool shared by both services. A
sleeping demo uses a fraction of it; two services awake around the clock would
exhaust it in about a fortnight.

**Everything on the pipeline board says SLA breached.**
Seed dates have drifted. Re-run **Reset demo data**.

---

## How migrations work

Migrations run in exactly one place: **Actions → Migrate database**, which
fires automatically when anything under `apps/api/prisma/` changes on `main`,
and can be run by hand.

They deliberately do **not** run when the API container starts. Render
restarts a free instance on every wake from sleep, so that meant migrating
several times a day and racing the reseed job for Prisma's advisory lock — the
P1002 failures. Local compose still opts in via `RUN_MIGRATIONS_ON_START=true`,
where there is no CI and no second migrator.

Both database jobs share the concurrency group `db-migrate`, so only one can
run at a time and neither is cancelled part-way. That replaces the advisory
lock with a guarantee that survives a crashed job, which the lock does not.

## Why the proxy

The session cookie is `sameSite: "lax"`, which is the right default. But
`onrender.com` is on the Public Suffix List, so `intervu-web.onrender.com` and
`intervu-api.onrender.com` are different **sites**, and a browser will not send
a `lax` cookie across them. Login would return `201` and every request after it
would come back unauthenticated — a failure that reads as a broken app rather
than a configuration mistake.

`API_PROXY_TARGET` makes `next.config.mjs` rewrite `/api/v1/*` to the API
service, so the browser only ever talks to one origin. The cookie stays
first-party with its CSRF protection intact, and CORS disappears because no
cross-origin request remains.

---

## Afterwards

- **Resume upload works with no file storage.** `RESUME_STORAGE=extract_only`
  reads the CV, keeps the extracted text the matcher consumes, and discards the
  file. To keep files instead, attach an S3-compatible bucket (Cloudflare R2,
  Supabase Storage) and set `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` /
  `S3_BUCKET` — and add a bucket purge to the nightly job, which resets the
  database only.
- **No email is sent.** No SMTP configured, which is fine: vendors see releases
  in the portal regardless.
- **To take it down**, suspend or delete both Render services. The Neon project
  can stay; it costs nothing.
