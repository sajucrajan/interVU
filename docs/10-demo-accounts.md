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
| `admin@acme.test` | Avery Admin | `org_admin` | org-wide | all 6 positions, review queue, settings | Only role that can erase candidates, manage vendors/settings/webhooks |
| `recruiter@acme.test` | Rafael Recruiter | `recruiter` | org-wide | all 6 positions, review queue | The everyday driver: create/publish positions, arbitrate duplicates, resolve match reviews |
| `hm.eng@acme.test` | Harper Manager | `hiring_manager` | **Engineering** vertical | 4 positions | Platform + Data teams only; **403** on the match-review queue; can record decisions |
| `pm.gtm@acme.test` | Parker PM | `project_manager` | **GTM** vertical | 2 positions | Read-only observer; GTM only — cannot see Engineering roles |
| `pm.platform@acme.test` | Priya PM | `project_manager` | **Platform** team | 2 positions | Read-only, single team — the narrowest scope |
| `interviewer1@acme.test` | Ingrid Interviewer | `interviewer` | org-wide | **0 positions**, 3 assigned interviews | Interviewers are *assignment*-scoped, not tree-scoped |
| `interviewer2@acme.test` | Ikenna Interviewer | `interviewer` | org-wide | **0 positions**, 2 assigned interviews | Use to see the hide-until-submitted feedback policy |
| `vendors@acme.test` | Mei Sourcing | `vendor_manager` *(custom)* | org-wide | all 6 positions, vendor performance | An organization-defined role: `positions.view`, `submissions.view`, `vendors.view_performance`. Reads the agency report; **403** on vendor contracts and the review queue |

### Things worth trying

- **Scoped visibility** — sign in as `pm.gtm` and then `pm.platform`; the positions list changes with the scope. Neither is offered `/match-reviews`; typing the URL gets a page saying whose job it is, with a way back (403 by design).
- **A Today per role** — Today opens with one line on what the role is for. Recruiters, hiring managers and interviewers get *"N things are waiting on you"*, counting only work they can do. Read-only roles (`pm.gtm`, `vendors`) get *"Here is where hiring stands"*: the same queues, muted, each labelled with who it waits on.
- **Assignment-scoped access** — `interviewer1` sees no positions at all, but `/interviews` lists their panels: one scorecard to file (Jordan Mitchell), one upcoming (Amira Haddad), one filed (Lucía Fernández). Opening a candidate from there shows their history, from scheduling until a decision is recorded (docs/09 §4.2). An interview that has not happened yet is never counted as owed.
- **Feedback policy** — Jordan Mitchell's debrief stays sealed until `interviewer1` files the overdue scorecard. File it with *Quick file*, then *View scorecards* on the filed row: your card, then Ikenna's, which was hidden until yours was in. Lucía Fernández's is open, and splits 5 to 2 on MLOps.
- **Match review queue** — two near-misses are waiting, each a real reason a matcher cannot decide alone: *Katherine Walsh* (StaffPro), a spelling variant of Catherine Walsh already on file, scored 77%; and *An Nguyen* (NorthStar), the same person as Nguyen Van An with the family name moved, scored 81%. Scored by the real matcher at seed time; a pair that ever falls outside the review band is skipped rather than forced.
- **Sourcing guard** — on POS-004 Frontend Engineer, switch sourcing to *Direct only*: it refuses and counts the agency candidates still active.
- **Custom roles** — `/admin/roles` (as the admin) lists *Vendor manager* beside the built-ins; it is an ordinary row the organization could have made itself.

## Vendor accounts

All four supply **Acme Corp** (`org_slug: acme`) and sign in at `/vendor/login`.

| Email | Vendor | Tier | Positions visible | Why the difference |
|---|---|---|---|---|
| `recruiter@talentbridge.test` | TalentBridge | **1** | 5 | Data Engineer is tiered and tier 1 has it now; Sales Operations Analyst was released to TalentBridge by hand |
| `recruiter@hireworks.test` | HireWorks | 2 | 3 | Gets Data Engineer three days after each reset; never had the manual release |
| `recruiter@staffpro.test` | StaffPro | 2 | 3 | Same as HireWorks; most of its submissions lost the ownership contest |
| `recruiter@northstar.test` | NorthStar Talent | 2 | 3 | The fourth agency, so the Performance benchmark has the three peers it requires |

Senior Platform Engineer is **direct-only**, so no agency sees it; its
candidates applied through the careers site, a referral or internally.

### Things worth trying

- **Duplicate probe** — submit a candidate from HireWorks using an email another vendor already used on the same role — try *POS-004 Frontend Engineer* with `sakura.tanaka@example.com`, whom TalentBridge already submitted there, or a `+tag` variant of it (normalization sees through it). You get *"not eligible: already in process from another source"* with no hint of who owns them; the org side sees the full contest.
- **Fuzzy review queue** — submit a near-match (slightly misspelled name, different email, same employer). It lands in `/match-reviews` for a human instead of auto-linking.
- **Vendor blindness** — nothing in the portal exposes other vendors, interviewer names, scorecards, or internal stages; statuses are coarse only.
- **Performance** — each agency's funnel, with screening rejections kept apart from post-panel ones, and a pooled comparison against the other three that never names them.

## Seeded content

| Data | Detail |
|---|---|
| Organization | Acme Corp (`acme`) |
| Hierarchy | Engineering → Platform, Data · GTM → Sales Ops, Marketing |
| Positions | 6, with skill matrices, rate bands, all three release policies (all-at-once, tiered, manual) and all three sourcing channels (vendor, hybrid, direct) |
| Vendors | 4 across 2 tiers |
| Candidates | ~43, including duplicate contests, near-duplicates in the review queue, and direct applicants |
| History | Stage transitions, decisions and offers dated across the past nine days, so time in stage, time to offer and time to first submission are real figures; a few breaches are deliberate |
| Panels | Platform Panel + Data & ML Panel (Engineering-scoped), Analytics Guild (org-wide) |

**Every agency submission respects its role's release**: an agency only ever
submitted to a role it could see at the time. The demo guide (`/demo`) names
seeded people and figures; if the seed changes them, change
`apps/web/src/app/demo/page.tsx` with it.

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
