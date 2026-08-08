# 12 — Deployment walkthrough, click by click

Getting InterVU onto a public URL for free. Allow about 40 minutes the first
time, most of it waiting for builds.

`docs/11` explains *why* each setting is what it is. This one is just the
steps, in order.

> **On button labels.** Neon and Koyeb redesign their consoles regularly, so
> a label here may read slightly differently by the time you follow it. The
> *values* are exact and come from this repository — those will not drift.
> When a label does not match, look for the nearest equivalent; nothing here
> depends on a specific console layout.

Before you start you need: a GitHub account with this repo, and an email
address. No credit card.

---

## What you are building

```
  browser ──▶ web service (Next.js, Koyeb)
                  │  proxies /api/v1/* internally
                  ▼
              api service (NestJS, Koyeb) ──▶ Postgres (Neon)
```

Two Koyeb services and one Neon database. The browser only ever talks to the
web service — that is deliberate and explained at the end.

---

## Step 1 — The database (Neon)

1. Go to **[neon.tech](https://neon.tech)** and sign up (GitHub sign-in is
   quickest).
2. Create a project. Name it `intervu`. Take the default Postgres version.
   Pick the region closest to you — it only affects latency.
3. When it finishes, you land on a **Connection Details** panel (or open the
   project **Dashboard** → **Connect**).
4. Make sure the connection string is the **pooled** one. There is usually a
   *Connection pooling* toggle — turn it **on**. The pooled host contains
   `-pooler`:

   ```
   postgresql://USER:PASSWORD@ep-something-pooler.REGION.aws.neon.tech/neondb?sslmode=require
   ```

   Use pooled because Koyeb services scale to zero and reconnect in bursts;
   the direct endpoint runs out of connections doing that.
5. **Copy it somewhere for the next ten minutes.** You need it three times:
   the API service, the GitHub secret, and nothing else. Neon shows the
   password once.

✅ *Done when:* you have a string starting `postgresql://` containing
`-pooler`.

---

## Step 2 — The API service (Koyeb)

1. Go to **[koyeb.com](https://koyeb.com)** and sign up. Free tier, no card.
2. **Create Service** → **GitHub** → authorise Koyeb → pick your `interVU`
   repository, branch `main`.
3. **Builder: choose Dockerfile**, not Buildpack. Buildpack cannot build a
   pnpm workspace and will fail confusingly.
   - **Dockerfile location:** `apps/api/Dockerfile`
   - **Work directory / build context:** leave **empty** (the repository
     root). The Dockerfile copies workspace files from the root, so a context
     of `apps/api` fails on missing `pnpm-lock.yaml`.
4. **Instance:** the free one. **Regions:** any single one.
5. **Ports:** `4000`, protocol HTTP. Path `/`.
6. **Health check:** HTTP on port `4000`, path **`/healthz`**.
   Not `/` — everything else lives under `/api/v1`, so `/` returns 404 and
   the service would be restarted forever as unhealthy.
7. **Environment variables:**

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooled Neon string from step 1 |
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `RESUME_STORAGE` | `extract_only` |
   | `WEB_ORIGIN` | `https://placeholder.koyeb.app` *(fixed in step 5)* |

8. **Service name:** `intervu-api`. Deploy.
9. Wait for the build (5–10 minutes the first time). Watch the runtime logs
   for `InterVU API listening on :4000`. Database migrations run
   automatically on start — you will see Prisma output above that line.
10. **Copy the public URL**, something like
    `https://intervu-api-yourorg.koyeb.app`.

✅ *Test it:* open `<api-url>/healthz` in a browser. You want
`{"status":"ok","service":"intervu-api"}`.

If it says unhealthy, it is almost always the health check path — see step 6.

---

## Step 3 — The web service (Koyeb)

Same flow: **Create Service** → GitHub → same repo, branch `main`.

1. **Builder: Dockerfile**
   - **Dockerfile location:** `apps/web/Dockerfile`
   - **Work directory / build context:** empty (repository root)
2. **Ports:** `3000`, HTTP, path `/`.
3. **Health check:** HTTP port `3000`, path `/` — the web app *does* serve a
   page there, so the default is fine here.
4. **Build arguments** — find the *Build* section, not the environment
   section. This is the step people get wrong:

   | Build argument | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `/api/v1` |
   | `NEXT_PUBLIC_DEMO_MODE` | `true` |
   | `NEXT_PUBLIC_DEMO_ORG` | `acme` |
   | `NEXT_PUBLIC_DEMO_PASSWORD` | `intervu-demo` |

   Next.js **inlines** every `NEXT_PUBLIC_*` value into the browser bundle at
   build time. Set as runtime variables they do nothing: the browser keeps
   calling `localhost:4000` and `/demo` 404s, with no error anywhere
   explaining why.

5. **Environment variable** (runtime, not build):

   | Name | Value |
   |---|---|
   | `API_PROXY_TARGET` | your API URL from step 2, e.g. `https://intervu-api-yourorg.koyeb.app` |

   No trailing slash.

6. **Service name:** `intervu-web`. Deploy, wait for the build.
7. **Copy the public URL**, e.g. `https://intervu-web-yourorg.koyeb.app`.

✅ *Test it:* open the URL. You should see the InterVU landing page with a
**Start here** link. Do not sign in yet — the database is still empty.

---

## Step 4 — Seed the demo data

The database has tables (migrations ran in step 2) but no rows.

1. In GitHub: your repo → **Settings** → **Secrets and variables** →
   **Actions** → **New repository secret**.
   - Name: `DEMO_DATABASE_URL`
   - Value: the same pooled Neon string
2. Go to the **Actions** tab → **Reset demo data** in the left sidebar →
   **Run workflow** → **Run workflow**.
3. Wait ~2 minutes. Green tick means done.

This same job runs nightly at 03:00 UTC, rebuilding the demo from scratch. The
demo password is public in `seed.ts` on purpose so visitors can explore; the
nightly reset is what stops anyone's changes from being permanent.

✅ *Test it:* open `<web-url>/demo`. Six personas, each with a **Sign in**
button. Click **Riley Recruiter** — you should land on a populated dashboard.

---

## Step 5 — Close the loop

Back in Koyeb → `intervu-api` → **Settings** → environment variables:

- Set `WEB_ORIGIN` to your real web URL from step 3.
- Redeploy the service.

Nothing in the browser depends on this once the proxy is working — it is
defence in depth for any direct call to the API.

---

## Done. What to check

| Check | Expected |
|---|---|
| `<web-url>/demo` | six personas, one-click sign-in |
| Sign in as Riley | dashboard with a populated queue |
| **Analytics**, bottom | *Where hires come from* with real figures |
| **Pipeline** | cards with source chips and aging colours |
| `<web-url>/vendor/login` as `recruiter@talentbridge.test` | vendor portal, its own submissions only |

---

## When something is wrong

**The page loads but nothing has data, and sign-in bounces back.**
`API_PROXY_TARGET` is unset, wrong, or has a trailing slash. The browser is
talking to the wrong place. Check the web service's environment tab.

**`/demo` returns 404 on the deployed site but works locally.**
`NEXT_PUBLIC_DEMO_MODE` was set as an environment variable rather than a
**build argument**. Move it and rebuild — a redeploy without a rebuild will
not pick it up.

**The API service keeps restarting.**
Health check path. It must be `/healthz`, not `/`.

**Build fails on a missing `pnpm-lock.yaml` or workspace package.**
The build context is set to `apps/api` or `apps/web`. It must be the
repository root.

**Login returns 201 and then everything is logged out again.**
`API_PROXY_TARGET` is missing, so the browser is calling the API service
directly. `koyeb.app` is on the Public Suffix List, which makes the two
services different *sites*, and the `sameSite: "lax"` session cookie is never
sent. The proxy exists precisely to keep the browser on one origin.

**First visit takes 30–60 seconds.**
Both services scale to zero on the free tier. The dashboard fires several
requests at once, so a cold visit can look broken before it looks slow. Not a
fault. A ~$2/month always-on instance removes it.

**Everything on the pipeline board says SLA breached.**
The seed backdates rows relative to seed time and has drifted. Re-run the
**Reset demo data** workflow.

---

## Afterwards

- **Resume upload works without any file storage.** `RESUME_STORAGE=extract_only`
  reads the CV, keeps the extracted text the matcher needs, and discards the
  file. To keep files instead, attach any S3-compatible bucket (Cloudflare R2,
  Supabase Storage) and set `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` /
  `S3_BUCKET` — and add a bucket purge to the nightly job, which resets the
  database only.
- **No email is sent.** No SMTP is configured, which is fine: vendors see
  releases in the portal regardless.
- **To take the demo down**, pause or delete both Koyeb services. The Neon
  project can stay; it costs nothing.
