# 13 — Running InterVU yourself

Everything needed to run InterVU on your own machine or server, from the
published container images. No Node toolchain, no clone of the repository.

You need **Docker** (Docker Desktop on a laptop, or Docker Engine with the
Compose plugin on a server) and about ten minutes.

> **Just looking?** The public demo at
> https://intervu-web-lby9.onrender.com/demo needs nothing installed. This
> page is for running it where you control the data.

---

## 1. What you are running

```
  browser ──▶ intervu-web (Next.js, port 3000)
                  │  proxies /api/v1/* to ↓
              intervu-api (NestJS, internal) ──▶ postgres (internal)
```

Three containers. Only the web app is reachable from outside; the browser
talks to it alone and it forwards API calls to the API container. That keeps
the session cookie first-party and the API off the network entirely.

| Image | What it is |
|---|---|
| `sajucrajan/intervu-api` | The API. Runs the database migrations on start. |
| `sajucrajan/intervu-web` | The web app. `:latest` has no demo page. `:demo` adds `/demo` with one-click sign-in for the seeded accounts. |

Both are on Docker Hub, built for `linux/amd64` and `linux/arm64` (Apple
Silicon works) with `deploy/build-images.sh` (§7). Tags: `latest`, `demo`,
the commit sha, and the version on releases. `IMAGE_PREFIX` in `.env`
points at a different registry or account if you publish your own.

## 2. Start it

```bash
mkdir intervu && cd intervu
curl -fsSLO https://raw.githubusercontent.com/sajucrajan/interVU/main/deploy/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/sajucrajan/interVU/main/deploy/.env.example -o .env
```

Open `.env` and set the two required values:

```
POSTGRES_PASSWORD=   # anything; it never leaves the stack
ERASURE_SALT=        # a long random string: openssl rand -hex 32
```

Then:

```bash
docker compose up -d
docker compose logs -f api     # until you see "Nest application successfully started"
```

The first start pulls the images and applies every migration. The database
lives in a Docker volume called `intervu_pgdata`, so `docker compose down`
and `up` again keep your data.

## 3. Create your organization

```bash
docker compose --profile setup run --rm bootstrap
```

It reads `ORG_NAME`, `ORG_SLUG`, `ADMIN_EMAIL`, `ADMIN_NAME` and
`ADMIN_PASSWORD` from `.env` and creates:

- the organization, with the default settings (ownership per position for
  180 days, scorecards hidden until submitted);
- the built-in roles (docs/09): organization admin, recruiter, hiring manager,
  project manager, interviewer;
- the default ways of working rated on every scorecard (docs/01 §4);
- one admin, active, with that password.

Open http://localhost:3000, sign in with the admin email and password. With
one organization on the deployment the sign-in page does not ask for it.
Run the same command again to reset the admin's password, or with a different
`ORG_SLUG` to add a second organization (the sign-in page then asks which).

From there, in the app:

1. **Admin → People & access** — invite your recruiters, hiring managers and
   interviewers. Each gets an activation link by email, or a link you can
   copy if mail is not set up.
2. **Admin → Teams** — the units and teams that scope what a hiring manager
   or project manager can see.
3. **Admin → Vendors** — the agencies you work with and their tiers. Each
   agency gets its own portal sign-in.
4. **Admin → Ways of working** — the attitude and collaboration attributes
   every interviewer rates. Edit the defaults to match how you hire.
5. **Admin → Appearance** — your colours, type and product name, with a
   preview of the main screens before you save.
6. **Positions** — post a role, share it with agencies, and the rest follows.

The manual for all of this is in the product at `/guide`.

## 4. Or load the demo data instead

To see the product full of realistic history before you put your own in:

```bash
docker compose --profile demo run --rm seed
```

That is the Acme demo from docs/10: eight staff accounts, four agencies,
positions in every release state, interviews, a sealed debrief, two match
reviews. Every account's password is `intervu-demo`. Set `WEB_TAG=demo` in
`.env` and `docker compose up -d web` for the guide page at `/demo` with
one-click sign-in.

Do not run the seed on a database that holds your real organization: it adds
Acme alongside it and the seeded password is public.

## 5. Putting it on a server

The stack is plain HTTP on port 3000. For anything beyond a laptop, put a
reverse proxy with TLS in front of it (Caddy is the least work):

```
hiring.example.com {
    reverse_proxy localhost:3000
}
```

and set in `.env`:

```
PUBLIC_URL=https://hiring.example.com
```

`PUBLIC_URL` is what decides CORS and whether the session cookie is marked
*Secure*. Over `https://` it is; over plain `http://` on a LAN address it is
not, which is what lets a browser keep the cookie at all. Set it to the
address people will actually type.

Other things worth setting before real use, all in `.env`:

| Setting | Why |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Invitations, agency release notices and scorecard reminders go by email. Without it they are logged, not sent; invitation links can still be copied from the admin screen. |
| `RESUME_STORAGE` | `extract_only` (the default) keeps the text of each CV and discards the file: no storage to run. Comment it out and set the `S3_*` values to keep the files in any S3-compatible bucket. See docs/11, *Resumes without object storage*. |
| `LOGIN_ORG_MODE` | `auto` hides the organization field when there is one organization. `manual` always asks. `picker` lists them, which publishes their names. |
| `INTERVU_TAG` | Pin to a sha or version instead of `latest` once you depend on it. |

## 6. Updating

```bash
docker compose pull
docker compose up -d
```

The API applies any new migrations on start; the web container restarts on
the new image. Take a backup first:

```bash
docker compose exec postgres pg_dump -U intervu intervu > intervu-$(date +%F).sql
```

and to restore into a fresh stack:

```bash
docker compose exec -T postgres psql -U intervu intervu < intervu-2026-10-11.sql
```

## 7. Building and publishing the images yourself

The images are built on a maintainer's machine, not in CI, so no Actions
minutes are spent on them. The same script works for anyone who would
rather run their own build, or needs the web app to reach the API somewhere
other than `http://api:4000`:

```bash
git clone https://github.com/sajucrajan/interVU && cd interVU
docker login                                   # Docker Hub; or docker login ghcr.io
IMAGE_PREFIX=<your docker hub username> deploy/build-images.sh v0.1.0
```

That builds the API image, the web image and the web `:demo` variant for
both architectures and pushes them tagged `latest`, the commit sha and, when
given, the version. Multi-arch builds need buildx with QEMU: Docker Desktop
has it; on a plain Linux engine run
`docker run --privileged --rm tonistiigi/binfmt --install all` once.

Variants:

- `PUSH=false deploy/build-images.sh` builds for this machine only, without
  pushing, to try the stack locally: then set `IMAGE_PREFIX` in `.env` to
  what you used and `docker compose up -d`.
- `DEMO=false` skips the demo variant.
- `API_PROXY_TARGET=http://my-api:4000` bakes a different API address into
  the web image. It is fixed at build time (docs/11 explains why), so it is
  the one thing an environment variable cannot change afterwards.

Publishing a new version, as the maintainer:

```bash
git checkout main && git pull
deploy/build-images.sh v0.2.0        # ~10 minutes on a laptop, mostly the arm64 half
git tag v0.2.0 && git push --tags
```

The repository's own `infra/docker-compose.yml --profile app` builds both
images from source and runs the same three containers; it is the
contributor's version of this page.

## 8. What is not here yet

- **Single sign-on.** Accounts are email and password, activated by
  invitation. OIDC is on the roadmap (docs/07).
- **A Helm chart.** The images run anywhere a container does; a chart is
  not written yet.
- **Backups and monitoring** are yours to arrange. `GET /healthz` on the API
  container answers `200` when it is up, and compose already uses it.

If something on this page does not work as written, open an issue: the
*Bug* template asks for exactly what is needed.

Testing it rather than running it? [docs/14](14-tester-guide.md) walks a
tester through a new organization end to end.
