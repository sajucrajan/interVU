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

Roles are **bundles of permissions**; enforcement is always on permissions, never on role names. That is what lets an organization define its own roles at runtime, without a code change or a migration.

### Roles are rows, not an enum

A `role` row belongs to an organization and carries a permission array. Five ship as `is_system` (below); everything else — **program manager**, **release train engineer**, **managing director** — is created by the organization in **Admin → Roles**, because no fixed list survives contact with a real org chart.

- The permission array is **sanitized on read**: a role still storing a permission the code has since removed grants nothing, rather than throwing.
- **System roles can be re-permissioned but not deleted**, so there is always something to grant. Their names are fixed because the seed, docs and demo accounts refer to them.
- **A role cannot be deleted while it is still granted**, and the error counts *grants*, not people — one person may legitimately hold the same role at several scopes.
- **The last role granting `org.manage_users` org-wide cannot have it removed.** This is the same lockout the last-admin guard prevents, reached from the other direction: strip the permission from the only role that has it and nobody can grant anything ever again.

Note that every guard here is keyed on the **`org.manage_users` permission**, never on a role called "org_admin". Once organizations name their own roles, a name guarantees nothing.

### Expressing a real org chart

The two shapes that matter both fall out of the existing scope rules:

- **A manager of one branch** — grant at that node; the subtree comes along, including teams added later.
- **A manager of teams that don't share a parent** (an RTE's train, a program spanning verticals) — grant the *same role at each team*. Grants are a union, so a set of teams works as naturally as a subtree. No "group" concept is needed.



The five built-ins start with these permissions (an organization can change any of them):

| Permission | org_admin | recruiter | hiring_manager | project_manager | interviewer |
|---|---|---|---|---|---|
| `positions.view` | ✓ | ✓ | ✓ | ✓ | — |
| `positions.create` | ✓ | ✓ | — | — | — |
| `positions.publish` / `.release` | ✓ | ✓ | — | — | — |
| `submissions.view` | ✓ | ✓ | ✓ | ✓ (counts + coarse status) | — |
| `submissions.arbitrate` | ✓ | ✓ | — | — | — |
| `candidates.view_history` | ✓ | ✓ | ✓ | — | contextual (§4) |
| `candidates.merge` / match review | ✓ | ✓ | — | — | — |
| `candidates.flag` | ✓ | ✓ | — | — | — |
| `applications.transition` | ✓ | ✓ | ✓ | — | — |
| `interviews.schedule` | ✓ | ✓ | ✓ | — | — |
| `panels.manage` (skill-tagged panelist pools) | ✓ | ✓ | ✓ (own scope) | — | — |
| `org.settings` (incl. white-label branding) | ✓ | — | — | — | — |
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

### Administering grants (Admin → People)

Users holding `org.manage_users` get **Admin → People**: the full directory
including invited and disabled users, each grant shown as `role @ scope`, and
controls to invite, grant, revoke, disable and re-enable.

Two rules keep the surface from undermining the model it edits:

- **A grant may never exceed the granter's own scope.** `Access.canGrantAt()`
  is deliberately stricter than `can()`: for granting, a *missing* unit means
  "everywhere" rather than "anywhere", so a unit-scoped admin cannot mint an
  org-wide grant, nor grant sideways into a subtree they don't administer.
  Without this distinction a team-level admin could promote themselves out of
  their own scope in one call.
- **The last person holding `org.manage_users` org-wide cannot be disabled or
  revoked.** Otherwise an organization locks itself out of user and structure
  management with no route back in through the UI. Keyed on the permission
  rather than a role named "org_admin", since roles are org-defined (§2).

### Administering the tree (Admin → Teams)

`org.manage_structure` unlocks renaming, moving and deleting units. Because a
move re-parents a whole subtree — and with it everyone's effective access — the
operation is guarded rather than a plain update:

- **A unit cannot be moved beneath itself or its own descendants.** That would
  detach the cycle from the tree entirely, orphaning every position under it.
- **Teams cannot gain children**, on move as well as on create.
- **Deletion refuses while anything depends on the node** — child units,
  positions, access grants, panels or templates — and names what is in the way.
  Silently reassigning a position's team, or dropping people's grants, would be
  a data change wearing a structural change's clothes.

### Invitations

New users are created with no password, in `invited` status, and receive a
single-use activation link (`/activate?token=…`):

- Only the **SHA-256 hash** of the token is stored, the same discipline as
  sessions — a leaked `invite_token` row cannot be replayed.
- Links **expire after 7 days**, are **single-use**, and issuing a new one
  retires any outstanding invitation for that user.
- Redemption sets the password and flips the user to `active` in one
  transaction, so two concurrent redemptions cannot both succeed.
- The link is delivered **by email only** — never through the org-wide
  Slack/Teams channels, whose audience is far wider than the invitee. It is
  also returned once to the inviting admin, so deployments with no SMTP
  configured can still onboard people.
- Missing, spent and expired tokens return one identical error, so probing
  reveals nothing about which tokens ever existed.

### Reading a debrief is not deciding

Viewing `/applications/:id/debrief` needs `submissions.view`; recording the
decision, editing the internal reason and releasing the vendor packet all need
`decisions.record`.

They were the same permission at first, which locked recruiters — the main
workflow role, and the people who chase outstanding scorecards and draft the
vendor-facing packet — out of the screen entirely. Seeing where a loop stands
is coordination; calling the outcome is not.

**The UI hides what the viewer cannot do.** The pipeline board's action menu is
built from the same capability list the rail uses, so a recruiter is never
offered "Record offer" and then refused by the API. An action you can see but
cannot take is worse than one that is absent, because it reads as a bug.

## 4. Contextual entitlements (where pure RBAC isn't enough)

Three flows deliberately cross or narrow the scope model; each is an explicit, documented exception — not a hole:

1. **Candidate history crosses scopes by design (R4).** A hiring manager for Platform interviewing Jane sees Jane's *full* org history — including her GTM interviews last year — because that is the product's core purpose. Rule: `candidates.view_history` on **any** application of the candidate that falls inside your scope unlocks the candidate's whole timeline. What stays restricted regardless: flag details follow flag visibility (docs/03), scorecard contents follow the feedback-visibility policy (docs/01 §2.3), and vendor-of-record identity on other teams' submissions requires `submissions.view` somewhere.
2. **Interviewers are assignment-scoped, not tree-scoped.** An interviewer sees a candidate packet (resume, history per policy) for interviews they are on the panel of — even for a team outside their grants — from schedule time until decision. Assignment *is* the grant.
3. **Do-not-hire flags surface as warnings anywhere.** A recruiter in any scope submitting/advancing a flagged candidate sees the warning (not necessarily the full reason — flag visibility applies). Safety signal beats scoping.

## 5. Explicit non-features (v1)

- **No deny/negative grants.** Union-only keeps effective access explainable ("why can Priya see this?" has a one-query answer). Exclusion = don't grant.
- **No per-object ACLs.** Confidential positions (M3+) will be a position-level `restricted` flag requiring a direct grant on the position's team — still expressed as a grant, not an ACL list.

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
