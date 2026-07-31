# 06 — API Design

API-first: the org workspace and vendor portal consume the same documented REST API. Zod contracts live in `packages/contracts`; OpenAPI publication is pending (M4).

> **Status:** endpoints below marked ✅ are implemented; unmarked ones are the
> designed surface still to come. Auth: `POST /auth/org/login`,
> `POST /auth/vendor/login`, `POST /auth/logout`, `GET /auth/me` ✅ (cookie
> sessions). **Both logins take `org_slug`** — vendors authenticate per client
> organization and a session is bound to exactly one organization
> (docs/05 §1). Also implemented beyond the original sketch: `GET /org-units` +
> `POST /org-units` ✅, `GET /org-users` ✅, `GET|POST /panels` +
> `GET /applications/{id}/panel-suggestions` ✅ (skill-matched panelists),
> `GET /skills` ✅, `GET /analytics/overview` ✅, `GET|PATCH /settings` ✅
> (incl. white-label branding).

## 1. Conventions

- Base path `/api/v1`. JSON; `snake_case` wire format.
- Auth: session cookie (web) or PAT/Bearer (integrations). Every token resolves to a `TenantContext` — org user or vendor user; the same endpoint may exist in both trees but they are **separate routes with separate DTOs** (never one endpoint that "filters harder" for vendors — vendor responses are distinct types that structurally cannot carry internal fields).
- Pagination: cursor-based (`?cursor=&limit=`); filtering via query params; `ETag`/`If-Match` on mutable resources.
- Errors: RFC 9457 problem+json with stable `code` slugs (`duplicate_submission`, `not_released`, `ownership_conflict`, …).
- Idempotency: `Idempotency-Key` header honored on all POSTs that create submissions/interviews.

## 2. Org API surface (summary)

```
# Positions & release
POST   /positions                          ✅ create (draft; role identity + skill matrix)
POST   /positions/{id}/publish             ✅ body: release_policy
GET    /positions/{id}                     ✅ full JD + release state
PATCH  /positions/{id}                     edit / pause / close
GET    /positions                          ✅ (entitlement-scoped)
POST   /positions/{id}/releases            ✅ manual/early release {vendor_org_id}

# Vendors
POST   /vendors                            invite vendor (creates vendor_org + admin invite)
PATCH  /vendors/{vendor_org_id}            tier, status, contract window
GET    /vendors/{vendor_org_id}/stats      funnel stats

# Submissions & matching
GET    /submissions?position_id=           ✅ (entitlement-scoped, vendor names + decisions)
POST   /submissions/{id}/arbitrate         {ownership_status, reason}
GET    /match-reviews                      ✅ review queue (open items, side-by-side)
POST   /match-reviews/{id}/resolve         ✅ {action: link|keep_separate}
POST   /candidates/{id}/merge              ✅ {merge_candidate_id}  (candidates.merge)
POST   /candidates/merge-events/{id}/reverse  ✅ un-merge

# Candidates & history
GET    /candidates?q=                      search (name/email/phone/skills)
GET    /candidates/{id}/timeline           ✅ permission-filtered cross-position history
POST   /candidates/{id}/flags              ✅ do-not-hire / caution / note
DELETE /candidates/{id}                    ✅ GDPR erasure (admin; body must echo the id)
POST   /match-reviews/sweep                ✅ run the re-match sweep on demand

# Pipeline & interviews
GET    /applications?position_id=          ✅
POST   /applications/{id}/transition       ✅ {to_stage, note}
POST   /applications/{id}/interviews       ✅ schedule round {round, panel[], at}
GET    /interviews/mine                    ✅ interviewer's assignments
POST   /interviews/{id}/scorecards         ✅ submit scorecard (panelist-only)
GET    /applications/{id}/scorecards       ✅ feedback-visibility-policy filtered
POST   /applications/{id}/decision         ✅ {outcome, reason}

# Admin
GET    /audit?entity_type=&entity_id=
POST   /webhooks                           ✅ {url, events[]} → returns secret once
GET    /webhooks  /  DELETE /webhooks/{id} ✅
GET    /notification-deliveries?status=    ✅ delivery log (pending/delivered/dead)
POST   /notification-deliveries/{id}/retry ✅ revive a dead letter
GET    /settings  /  PATCH /settings       ✅ ownership scope/window, feedback policy,
                                              branding, notification channels
```

## 3. Vendor API surface (separate route tree, vendor session required)

```
GET    /vendor/positions                   ✅ released+open only, full sourcing view (JD, skills, rate band)
POST   /vendor/positions/{id}/submissions  ✅ submit profile
       → 201 {submission, idempotent, pending_review?}
       → 409 {code: duplicate_submission}   ← probe, no source details
GET    /vendor/submissions                 ✅ own submissions only, coarse status
POST   /vendor/submissions/{id}/resume     ✅ multipart upload (PDF/TXT/DOCX, 10MB;
                                              text extracted for the matcher)
POST   /vendor/submissions/{id}/withdraw
POST   /vendor/users                       vendor_admin invites recruiters
```
Org side: `GET /submissions/{id}/resume` ✅ returns a short-lived presigned
download URL (any S3-compatible store — AWS S3, MinIO, R2 — via env).

Vendor DTO example — note what's *absent* (no candidate_id, no internal status, no history):

```json
{
  "id": "sub_9f2…",
  "position": {"id": "pos_1a…", "title": "Senior Data Engineer"},
  "candidate_name": "Jane Doe",
  "status": "interviewing",
  "submitted_at": "2026-07-30T10:12:00Z",
  "last_status_change": "2026-08-04T09:00:00Z"
}
```

## 4. Webhook events

`position.published`, `position.released_to_vendor`, `position.closed`, `submission.created`, `submission.duplicate_flagged`, `submission.status_changed`, `candidate.merged`, `candidate.merge_reversed`, `interview.scheduled`, `interview.completed`, `scorecard.submitted`, `decision.recorded`, `candidate.erasure_completed`.

Payloads are HMAC-SHA256 signed (`X-InterVU-Signature`), retried with exponential backoff for 24h, with a delivery log UI.

## 5. AuthN/AuthZ details

- **Org users:** email+password (argon2) and magic link in core; OIDC SSO adapter (any provider incl. Keycloak/Entra/Google) as the enterprise path. Sessions are httpOnly cookies with CSRF tokens.
- **Vendor users:** credential/magic-link only (vendors won't be in the org's IdP). Invitation-based signup; vendor_admin manages seats.
- **Service tokens:** org-scoped PATs with granular scopes (`positions:read`, `webhooks:manage`, …) for integrations.
- Rate limits per token + per vendor (submission spam is a real abuse vector); upload size caps; AV scan before parse.
