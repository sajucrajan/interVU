# 11 — Deploying the public demo (Neon + Render)

A free, always-available deployment of the demo. Neon supplies Postgres on a
permanent free tier; Render runs the two containers the repo already builds.

> Koyeb was the original target and does not work: its free tier allows one
> service per organization and this needs two. Render permits several. The
> cookie problem below is identical on both, because `onrender.com` and
> `koyeb.app` are both on the Public Suffix List.

> **Following this for the first time?** Read
> [12 — Deployment walkthrough](12-deployment-walkthrough.md) instead: the
> same deployment as an ordered click-by-click, with the failure modes and
> what each check should show. This page is the reference for *why* each
> setting is what it is.

## What the app actually needs

| Service | Required? | Notes |
|---|---|---|
| PostgreSQL | **yes** | The only hard dependency |
| S3 / MinIO | no | `S3_ENDPOINT` unset disables resume upload; the API returns a clean *"File storage is not configured"* rather than failing |
| SMTP | no | Unset means no outbound email. Vendors still see releases in the portal — email off never hides a release (docs/05 §5) |
| Redis | **no** | Declared in `docker-compose.yml` under the `full` profile but **no code uses it**. Do not provision one |

## The one thing that will silently break

The session cookie is `sameSite: "lax"` (`auth.controller.ts`). Koyeb publishes
each service under its own subdomain of `onrender.com`, and `onrender.com` is on the
Public Suffix List — so `intervu-web.onrender.com` and `intervu-api.onrender.com` are
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

## 2. API service — Render

New service → GitHub → this repo. Build with **Dockerfile**
`apps/api/Dockerfile`, **build context the repo root** (the Dockerfile expects
it), port `4000`.

```
DATABASE_URL   = <neon pooled connection string>
NODE_ENV       = production
PORT           = 4000
WEB_ORIGIN     = https://<web-service>.onrender.com
```

`WEB_ORIGIN` is a placeholder on the first deploy — you do not know the web URL
yet. Come back and set it after step 3. Nothing in the browser depends on it
once the proxy is in place; it is defence in depth for any direct call.

Migrations need no step of their own: the image's `CMD` runs
`prisma migrate deploy` before starting the server.

## 3. Web service — Render

Dockerfile `apps/web/Dockerfile`, context the repo root, port `3000`.

```
build args: NEXT_PUBLIC_API_URL      = /api/v1
            NEXT_PUBLIC_DEMO_MODE    = true
            NEXT_PUBLIC_DEMO_ORG     = acme
            NEXT_PUBLIC_DEMO_PASSWORD = intervu-demo
env:        API_PROXY_TARGET         = https://<api-service>.onrender.com
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

It runs one script — `pnpm --filter @intervu/api demo:reset` — which is the
same thing you can run locally, so the nightly job and a local reset cannot
drift into meaning different things. The script does `migrate reset` and then
the seed as separate steps: reset does not run the seed unless `prisma.seed`
is configured in package.json, and it is not, so reset alone would leave an
empty schema. Re-running the seed *without* a reset would not do either — it
upserts, so it restores what was deleted but cannot undo what was edited.

### Running it locally

```
pnpm --filter @intervu/api demo:reset
```

Worth doing before you show the app to anyone. The seed backdates rows
relative to seed time, so a database left alone for a week or two drifts until
every card on the pipeline board reads `SLA breached` — which buries the aging
design under a wall of red. A fresh reset puts it back to a couple of
deliberate breaches against a healthy board.

**It destroys the database it points at.** Prisma will refuse to run it
non-interactively without explicit consent, which is the behaviour you want:
check `DATABASE_URL` before answering.

## Resumes without object storage

Neither Neon nor a Render container gives you a durable place to put a file: the
container filesystem is wiped on redeploy and on scale-to-zero, so writing
locally is not storage, it is a delay before data loss.

`RESUME_STORAGE=extract_only` avoids needing any. The API reads the upload,
keeps the extracted text — which is the part the matcher actually consumes
(docs/04) — and discards the bytes. The vendor submission flow works end to
end and match scores are real, with no bucket, no credentials and nothing to
clean up.

What it costs:

- **The original file is gone.** `GET /submissions/:id/resume` returns
  `bytes_not_retained` and says so. No screen calls that endpoint today, so
  nothing visibly breaks — but a real install would be giving up the reviewer
  and interviewer download.
- **Text has to be readable.** PDF, DOCX and plain text all extract. What
  cannot be read — an empty document, or a scan with no text layer — is
  refused with `text_not_extractable`, because with no bytes retained such a
  row would record that a resume once existed while holding none of it.

It is opt-in for that reason: a production install that silently stopped
keeping CVs because a variable was unset would be a much worse failure than an
upload that refuses.

**If you would rather keep the files**, attach any S3-compatible bucket —
Cloudflare R2 and Supabase Storage both have free tiers — and set `S3_ENDPOINT`
/ `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` instead. Note that the
nightly job resets the *database* only: bucket objects would outlive the rows
pointing at them, so add a bucket purge to the workflow if you go that way.

## Known limits of the free tier

- **Cold starts.** A scaled-to-zero service takes tens of seconds on the first
  request. The dashboard issues several API calls at once, so a cold visit can
  look broken before it looks slow.
- **Resume upload runs without any storage.** Set `RESUME_STORAGE=extract_only`
  on the API service — see below.
- **Seed dates drift.** The demo backdates rows relative to seed time; a
  database left unseeded for weeks shows everything as SLA-breached. The
  nightly job keeps this honest.
