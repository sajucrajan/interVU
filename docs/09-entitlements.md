# 09 — Entitlements & Authorization

How user logins map to what they can see and do. Builds on the org-unit hierarchy (docs/03 §2) and the tenancy walls (docs/02 §4). Tenancy answers *"which organization/vendor's data exists for you at all"*; entitlements answer *"which slice of it, with which capabilities."*

## 1. Model: grants = role @ scope

A **grant** is one `org_membership` row: a **role** (bundle of permissions) attached at a **scope** (an org-unit node, or the whole org when `org_unit_id` is null).

```
grant  = (user, role, scope)
scope  = org-wide | any org_unit (vertical/unit/team)
effect = role's permissions apply to the scope node and ALL descendants
access = UNION of all the user's grants (no deny rules — see §5)
```

Examples the model must express (all verified in seed/tests):

| Person | Grants | Result |
|---|---|---|
| Org admin | `org_admin @ org` | Everything |
| Org-wide recruiter | `recruiter @ org` | Full pipeline capability, all units |
| Engineering hiring manager | `hiring_manager @ Engineering` | Sees/decides for Platform + Data teams; GTM invisible |
| GTM project manager | `project_manager @ GTM` | Read-only positions & submission funnel under GTM only |
| Team-only PM | `project_manager @ Platform` | One team's view |
| Cross-vertical lead | `hiring_manager @ Engineering` **+** `project_manager @ GTM` | Union: manage Engineering, observe GTM |
| Interviewer | `interviewer @ org` (or scoped) | Nothing until assigned to an interview (§4) |

## 2. Roles and the permission catalog

Roles are **bundles of permissions**; enforcement is always on permissions, never on role names — so custom roles (M4) slot in without touching call sites.

| Permission | org_admin | recruiter | hiring_manager | project_manager | interviewer |
|---|---|---|---|---|---|
| `positions.view` | ✓ | ✓ | ✓ | ✓ | — |
| `positions.create` | ✓ | ✓ | — | — | — |
| `positions.publish` / `.release` | ✓ | ✓ | — | — | — |
| `submissions.view` | ✓ | ✓ | ✓ | ✓ (counts + coarse status) | — |
| `submissions.arbitrate` | ✓ | ✓ | — | — | — |
| `candidates.view_history` | ✓ | ✓ | ✓ | — | contextual (§4) |
| `candidates.merge` / match review | ✓ | ✓ | — | — | — |
| `interviews.schedule` | ✓ | ✓ | ✓ | — | — |
| `scorecards.submit` | — | — | — | — | ✓ (own interviews) |
| `decisions.record` | ✓ | — | ✓ | — | — |
| `vendors.manage` | ✓ | — | — | — | — |
| `org.manage_structure` (units/teams) | ✓ | — | — | — | — |
| `org.manage_users`, settings, audit | ✓ | — | — | — | — |

`project_manager` is the deliberately read-only observer role the requirement calls for: funnel visibility for the verticals/units/teams they run, no hiring actions, no candidate PII beyond what their reports need (name + stage; resumes and scorecards excluded by default — org-configurable).

## 3. Scope semantics

- **Inheritance:** a grant at a node covers the node and its entire subtree. Grant at `Engineering` ⇒ Platform, Data, and any team added under Engineering later — entitlements follow re-orgs automatically.
- **Union, not override:** multiple grants merge additively. `hiring_manager @ Platform` + `project_manager @ org` = manage Platform, observe everything else.
- **Org structure metadata** (unit/team names, the tree shape) is visible to all org users — it's navigation, not data. All *data* under a node is scoped.
- **Moving a unit** re-parents its subtree and therefore its effective entitlements; the move is audited (`org_unit.moved`) precisely because it is an entitlement change.
- **Resolution is query-time:** effective unit-sets are computed per request from the memberships + tree (small, cached per request). Nothing is denormalized, so there is no stale-grant window.

## 4. Contextual entitlements (where pure RBAC isn't enough)

Three flows deliberately cross or narrow the scope model; each is an explicit, documented exception — not a hole:

1. **Candidate history crosses scopes by design (R4).** A hiring manager for Platform interviewing Jane sees Jane's *full* org history — including her GTM interviews last year — because that is the product's core purpose. Rule: `candidates.view_history` on **any** application of the candidate that falls inside your scope unlocks the candidate's whole timeline. What stays restricted regardless: flag details follow flag visibility (docs/03), scorecard contents follow the feedback-visibility policy (docs/01 §2.3), and vendor-of-record identity on other teams' submissions requires `submissions.view` somewhere.
2. **Interviewers are assignment-scoped, not tree-scoped.** An interviewer sees a candidate packet (resume, history per policy) for interviews they are on the panel of — even for a team outside their grants — from schedule time until decision. Assignment *is* the grant.
3. **Do-not-hire flags surface as warnings anywhere.** A recruiter in any scope submitting/advancing a flagged candidate sees the warning (not necessarily the full reason — flag visibility applies). Safety signal beats scoping.

## 5. Explicit non-features (v1)

- **No deny/negative grants.** Union-only keeps effective access explainable ("why can Priya see this?" has a one-query answer). Exclusion = don't grant.
- **No per-object ACLs.** Confidential positions (M3+) will be a position-level `restricted` flag requiring a direct grant on the position's team — still expressed as a grant, not an ACL list.
- **No custom roles yet** (M4: org-defined permission bundles; enforcement already permission-keyed so this is additive).

## 6. Enforcement architecture

Same defense-in-depth stack as tenancy (docs/02 §4), one layer deeper:

1. **AuthzService** resolves the request's grants → `Access` object: `can(permission, unitId?)` and `unitIdsFor(permission) → 'org' | unitId[]` (memoized per request).
2. **Services filter by scope at the query**, not post-hoc: `WHERE org_unit_id IN unitIdsFor('positions.view')`. Scoped users never page through 403s.
3. **Mutations check the target's unit** (`can('positions.publish', position.org_unit_id)`) → 403 `insufficient_scope` with the missing permission named.
4. **Entitlement changes are audited**: membership grant/revoke, unit moves, role changes — actor, before/after, timestamp. Reviewing *who changed access* matters as much as access itself.
5. **CI leakage suite** extends to entitlements: fixtures with scoped PMs/HMs assert both presence and absence across every list endpoint.

### Login → entitlement flow

```
login (session / SSO)            [docs/06 §5]
  → org_user + memberships loaded into TenantContext   (tenancy: WHO)
  → AuthzService.access(ctx)                           (entitlements: WHAT)
  → guards/services consult Access                     (enforcement)
```

**SSO group mapping (M4):** orgs map IdP groups → grants (`AAD "Eng-Managers" → hiring_manager @ Engineering`), evaluated at login; grants stay in `org_membership` so the audit and resolution paths are identical for manual and SSO-derived grants.

### Vendor-side entitlements (simpler by policy)

Vendors get exactly two roles — `vendor_admin` (manage own users, see all own submissions) and `vendor_recruiter` (submit, see own submissions). No unit scoping: vendors never see org structure at all. The vendor wall (docs/05) dominates everything on that side.
