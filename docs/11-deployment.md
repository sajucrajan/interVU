# 11 — Deploying the public demo (Neon + Koyeb)

A free, always-available deployment of the demo. Neon supplies Postgres on a
permanent free tier; Koyeb runs the two containers the repo already builds.

## What the app actually needs

| Service | Required? | Notes |
|---|---|---|
| PostgreSQL | **yes** | The only hard dependency |
| S3 / MinIO | no | `S3_ENDPOINT` unset disables resume upload; the API returns a clean *"File storage is not configured"* rather than failing |
| SMTP | no | Unset means no outbound email. Vendors still see releases in the portal — email off never hides a release (docs/05 §5) |
| Redis | **no** | Declared in `docker-compose.yml` under the `full` profile but **no code uses it**. Do not provision one |

## The one thing that will silently break

The session cookie is `sameSite: "lax"` (`auth.controller.ts`). Koyeb publishes
each service under its own subdomain of `koyeb.app`, and `koyeb.app` is on the
Public Suffix List — so `web-xxx.koyeb.app` and `api-xxx.koyeb.app` are
**different sites**. A browser will not send a `lax` cookie across them. Login
returns 201, and every request after it comes back unauthenticated.

The fix is a **same-origin proxy**, not a weaker cookie. With
`API_PROXY_TARGET` set, `next.config.mjs` rewrites `/api/v1/*` to the API
service, so the browser only ever talks to the web origin:

- the cookie is first-party, and `lax` keeps its CSRF protection
- CORS disappears entirely — there is no cross-origin request left to preflight
- the API stays independently addressable for anything non-browser

Verified locally: through the proxy, `POST /api/v1/auth/org/login` sets a
cookie with **no `Domain` attribute** (so it binds to the web origin), and the
following `GET /api/v1/auth/me` authenticates.

## 1. Database — Neon

Create a project at [neon.tech](https://neon.tech) (free, permanent, no card)
and copy the pooled connection string. Use Neon rather than a host-provided
free Postgres: several delete free databases after 30 days.

## 2. API service — Koyeb

New service → GitHub → this repo. Build with **Dockerfile**
`apps/api/Dockerfile`, **build context the repo root** (the Dockerfile expects
it), port `4000`.

```
DATABASE_URL   = <neon pooled connection string>
NODE_ENV       = production
PORT           = 4000
WEB_ORIGIN     = https://<web-service>.koyeb.app
```

`WEB_ORIGIN` is a placeholder on the first deploy — you do not know the web URL
yet. Come back and set it after step 3. Nothing in the browser depends on it
once the proxy is in place; it is defence in depth for any direct call.

Migrations need no step of their own: the image's `CMD` runs
`prisma migrate deploy` before starting the server.

## 3. Web service — Koyeb

Dockerfile `apps/web/Dockerfile`, context the repo root, port `3000`.

```
build args: NEXT_PUBLIC_API_URL      = /api/v1
            NEXT_PUBLIC_DEMO_MODE    = true
            NEXT_PUBLIC_DEMO_ORG     = acme
            NEXT_PUBLIC_DEMO_PASSWORD = intervu-demo
env:        API_PROXY_TARGET         = https://<api-service>.koyeb.app
```

Every `NEXT_PUBLIC_*` value is inlined into the client bundle at **build**
time, so all four must be build arguments. Setting them as runtime variables
leaves the browser calling `localhost:4000` and the guide page dark. A
*relative* `NEXT_PUBLIC_API_URL` is what puts the browser on the web origin.

## The guide page (`/demo`)

`NEXT_PUBLIC_DEMO_MODE=true` publishes a landing page that explains what the
product is, offers **one-click sign-in** for six personas, and suggests what to
look at. Without the flag the route 404s and the home page does not link it —
a self-hosted production install must never publish working credentials.

**The org_admin account is deliberately absent.** That is presentation, not
security: the seed and its password are in a public repository, so anyone
determined can find it. What omitting it buys is a demo that stays
demonstrable — nothing invites a visitor into org settings, vendor contracts
or GDPR erasure, which are the operations that would quietly wreck the tour for
whoever arrives next. The nightly reset is the actual safety net.

The six personas are chosen to make the invisible parts visible: a recruiter
(the widest view), a hiring manager (the same product with a smaller world), a
read-only project manager (scope isolation from the other side), an
interviewer (assignment *is* the grant), and two vendors at different tiers —
whose different views of the same day are the tiered release ladder.

## 4. Seed the demo

The nightly workflow (below) also seeds. Run it once by hand from the Actions
tab — **Reset demo data → Run workflow** — to populate the fresh database.

## 5. Nightly reset

`.github/workflows/demo-reseed.yml` drops and rebuilds the demo at 03:00 UTC.

The demo password is published in `seed.ts`, so anyone can sign in and change
or delete things. That is deliberate — visitors should be able to click
through it — and this job makes the damage temporary.

Set the repository secret **`DEMO_DATABASE_URL`** to the Neon connection
string. Without it the job fails loudly rather than appearing to succeed
against nothing.

Note it runs `migrate reset` and then the seed as two explicit steps. Re-running
the seed alone would not do: it upserts, so it restores what was deleted but
cannot undo what was edited or added.

## Known limits of the free tier

- **Cold starts.** A scaled-to-zero service takes tens of seconds on the first
  request. The dashboard issues several API calls at once, so a cold visit can
  look broken before it looks slow.
- **No file storage**, so resume upload is disabled unless you add an
  S3-compatible bucket and set `S3_ENDPOINT` / `S3_ACCESS_KEY` /
  `S3_SECRET_KEY` / `S3_BUCKET`.
- **Seed dates drift.** The demo backdates rows relative to seed time; a
  database left unseeded for weeks shows everything as SLA-breached. The
  nightly job keeps this honest.
