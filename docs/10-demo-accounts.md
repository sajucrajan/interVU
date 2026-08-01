# 10 — Demo Accounts & Test Data

Everything here is created by `pnpm --filter @intervu/api db:seed` (idempotent —
safe to re-run). **Every account uses the password `intervu-demo`.**

The organization slug is **`acme`**. On a single-organization deployment the
sign-in page resolves it automatically and shows *"Signing in to Acme Corp"* —
you only type an organization when the deployment hosts several
(see `LOGIN_ORG_MODE` in [05](05-vendor-portal-and-release.md#vendor-login-is-organization-scoped)).

## Sign-in URLs

| Audience | URL |
|---|---|
| Organization (internal staff) | http://localhost:3000/login |
| Vendors (external agencies) | http://localhost:3000/vendor/login |

## Organization accounts

Counts below are **observed behaviour** on freshly seeded data, and they
demonstrate the entitlement model (`role @ scope`, see [09](09-entitlements.md)).

| Email | Name | Role | Scope | Sees | Notes |
|---|---|---|---|---|---|
| `admin@acme.test` | Avery Admin | `org_admin` | org-wide | all 11 positions, review queue, settings | Only role that can erase candidates, manage vendors/settings/webhooks |
| `recruiter@acme.test` | Riley Recruiter | `recruiter` | org-wide | all 11 positions, review queue | The everyday driver: create/publish positions, arbitrate duplicates, resolve match reviews |
| `hm.eng@acme.test` | Harper Manager | `hiring_manager` | **Engineering** vertical | 8 positions | Platform + Data teams only; **403** on the match-review queue; can record decisions |
| `pm.gtm@acme.test` | Parker PM | `project_manager` | **GTM** vertical | 3 positions | Read-only observer; GTM only — cannot see Engineering roles |
| `pm.platform@acme.test` | Peyton PM | `project_manager` | **Platform** team | 4 positions | Read-only, single team — the narrowest scope |
| `interviewer1@acme.test` | Indira Interviewer | `interviewer` | org-wide | **0 positions**, 2 assigned interviews | Interviewers are *assignment*-scoped, not tree-scoped |
| `interviewer2@acme.test` | Ivan Interviewer | `interviewer` | org-wide | **0 positions**, 1 assigned interview | Use to see the hide-until-submitted feedback policy |

### Things worth trying

- **Scoped visibility** — sign in as `pm.gtm` and then `pm.platform`; the positions list changes with the scope. Neither can reach `/match-reviews` (403 by design).
- **Assignment-scoped access** — `interviewer1` sees no positions at all, but `/interviews` lists their panels; opening a candidate from there still shows full history.
- **Feedback policy** — with the default `hidden_until_submitted`, `interviewer2` sees *no* scorecards on a shared interview until submitting their own, then sees everyone's.
- **Duplicate contest** — the dashboard banner counts submissions where a second vendor was blocked; the submissions table shows ownership per row.

## Vendor accounts

All three supply **Acme Corp** (`org_slug: acme`) and sign in at `/vendor/login`.

| Email | Vendor | Tier | Positions visible | Why the difference |
|---|---|---|---|---|
| `recruiter@talentbridge.test` | TalentBridge | **1** | 10 | Tier 1 sees tiered releases immediately |
| `recruiter@hireworks.test` | HireWorks | 2 | 8 | Tier-2 releases unlock later; manual-release roles never reached them |
| `recruiter@staffpro.test` | StaffPro | 2 | 8 | Same as HireWorks |

The differing counts are the **tiered release** feature working: compare
TalentBridge and HireWorks on the *Data Engineer* role.

### Things worth trying

- **Duplicate probe** — submit a candidate from HireWorks using an email another vendor already used (try `jane.doe@gmail.com`, or a `+tag`/googlemail variant — normalization sees through both). You get *"not eligible: already in process from another source"* with no hint of who owns them; the org side sees the full contest.
- **Fuzzy review queue** — submit a near-match (slightly misspelled name, different email, same employer). It lands in `/match-reviews` for a human instead of auto-linking.
- **Vendor blindness** — nothing in the portal exposes other vendors, interviewer names, scorecards, or internal stages; statuses are coarse only.

## Seeded content

| Data | Detail |
|---|---|
| Organization | Acme Corp (`acme`) |
| Hierarchy | Engineering → Platform, Data · GTM → Sales Ops, Marketing |
| Positions | ~11 across all teams, with skill matrices, rate bands, and all three release policies (all-at-once, tiered, manual) |
| Vendors | 3 across 2 tiers |
| Candidates | ~40, including deliberately planted duplicates and near-duplicates |
| Panels | Platform Panel + Data & ML Panel (Engineering-scoped), Analytics Guild (org-wide) |

## Resetting

```bash
pnpm --filter @intervu/api db:seed          # top up (idempotent)
```

For a clean slate, drop the volume and re-migrate:

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @intervu/api db:migrate && pnpm --filter @intervu/api db:seed
```

> ⚠️ These are **demo credentials with a published password**. Never seed demo
> data into a production deployment.
