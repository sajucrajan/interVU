# 06 — API Design

API-first: the org workspace and vendor portal consume the same documented REST API. OpenAPI spec generated from NestJS decorators + zod contracts in `packages/contracts`; published at `/api/docs`.

## 1. Conventions

- Base path `/api/v1`. JSON; `snake_case` wire format.
- Auth: session cookie (web) or PAT/Bearer (integrations). Every token resolves to a `TenantContext` — org user or vendor user; the same endpoint may exist in both trees but they are **separate routes with separate DTOs** (never one endpoint that "filters harder" for vendors — vendor responses are distinct types that structurally cannot carry internal fields).
- Pagination: cursor-based (`?cursor=&limit=`); filtering via query params; `ETag`/`If-Match` on mutable resources.
- Errors: RFC 9457 problem+json with stable `code` slugs (`duplicate_submission`, `not_released`, `ownership_conflict`, …).
- Idempotency: `Idempotency-Key` header honored on all POSTs that create submissions/interviews.

## 2. Org API surface (summary)

```
# Positions & release
POST   /positions                          create (draft)
POST   /positions/{id}/publish             body: release_policy
PATCH  /positions/{id}                     edit / pause / close
GET    /positions?status=&team_id=
GET    /positions/{id}/releases            release panel (who sees it, when)
POST   /positions/{id}/releases            manual/early release {vendor_org_id, visible_from?}

# Vendors
POST   /vendors                            invite vendor (creates vendor_org + admin invite)
PATCH  /vendors/{vendor_org_id}            tier, status, contract window
GET    /vendors/{vendor_org_id}/stats      funnel stats

# Submissions & matching
GET    /submissions?position_id=&status=&ownership_status=
GET    /submissions/{id}                   incl. match_decision + feature breakdown
POST   /submissions/{id}/arbitrate         {ownership_status, reason}
GET    /match-reviews?status=open          review queue
POST   /match-reviews/{id}/resolve         {action: link|keep_separate}
POST   /candidates/{id}/merge              {merge_candidate_id}  (admin)
POST   /merge-events/{id}/reverse          un-merge              (admin)

# Candidates & history
GET    /candidates?q=                      search (name/email/phone/skills)
GET    /candidates/{id}                    master record
GET    /candidates/{id}/timeline           permission-filtered history
POST   /candidates/{id}/flags              do-not-hire / caution
DELETE /candidates/{id}                    GDPR erasure workflow (admin, two-step confirm)

# Pipeline & interviews
POST   /applications/{id}/transition       {to_stage, note}
POST   /applications/{id}/interviews       schedule round {round, panel[], at, link}
GET    /interviews?mine=true               interviewer's assignments
POST   /interviews/{id}/scorecards         submit scorecard
GET    /applications/{id}/scorecards       visibility-policy filtered
POST   /applications/{id}/decision         {outcome, reason}

# Admin
GET    /audit?entity_type=&entity_id=
POST   /webhooks                           {url, events[]}
GET    /settings  /  PATCH /settings       ownership scope/window, feedback policy, thresholds
```

## 3. Vendor API surface (separate route tree, vendor session required)

```
GET    /vendor/positions                   only released + open, per visibility predicate
GET    /vendor/positions/{id}              sanitized position view
POST   /vendor/positions/{id}/submissions  submit profile (multipart or presigned-upload flow)
       → 201 {status: received}
       → 409 problem+json {code: duplicate_submission}   ← pre-flight probe, no details
GET    /vendor/submissions?position_id=    own submissions only, coarse status
GET    /vendor/submissions/{id}
POST   /vendor/submissions/{id}/withdraw
POST   /vendor/users                       vendor_admin invites recruiters
```

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
