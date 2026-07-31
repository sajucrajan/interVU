# 04 — Candidate Matching Engine (Identity Resolution)

> **Status:** implemented through the review queue, reversible merges, the
> daily re-match sweep (§4), and erasure tombstones (§7). Remaining: the
> optional intelligence plugins (§5) and identity-edit re-evaluation.

The matching engine answers one question on every submission: **is this person already known to this organization?** It must be conservative (a wrong merge leaks one person's interview history into another's packet), explainable (recruiters must see *why* two records matched), and cheap (runs synchronously enough that vendors get instant duplicate feedback).

## 1. Design principles

1. **Never destructive by default.** Auto-*link* is allowed at very high confidence; auto-*merge* of two existing masters is never automatic — always a human.
2. **Explainable scores.** Every decision stores a per-feature breakdown (`match_decision.feature_breakdown`), rendered in the review UI.
3. **Pure core.** All normalizers/similarity/scoring live in `packages/matching-core` with zero DB dependencies — unit-testable, fuzz-testable, and the easiest place for new contributors to work.
4. **Pluggable stages.** Embedding similarity and LLM adjudication are optional providers behind interfaces; the default pipeline is fully algorithmic and offline.

## 2. Pipeline

```mermaid
flowchart TD
    A[Submission received] --> B[1. Normalize]
    B --> C[2. Deterministic match<br/>email / phone / linkedin / ext-id]
    C -->|hit| L[Auto-link to candidate]
    C -->|no hit| D[3. Blocking:<br/>generate candidate set]
    D --> E[4. Score each pair]
    E -->|score ≥ T_high| L
    E -->|T_low ≤ score < T_high| Q[Review queue]
    E -->|score < T_low| N[Create new candidate]
    L --> O[5. Ownership evaluation]
    N --> O
    Q -->|human links| L
    Q -->|human separates| N
```

### Stage 1 — Normalization (`matching-core/normalize`)

| Field | Normalization |
|---|---|
| Email | lowercase, trim; strip `+tag`; provider dot-stripping (gmail) **configurable, default on**; store raw + norm |
| Phone | E.164 via libphonenumber with org default region; compare last-10-digits as fallback key |
| Name | Unicode NFKC, casefold, strip honorifics/suffixes, collapse whitespace; token-sort form; phonetic form (double metaphone) |
| LinkedIn/URLs | canonical host + path, strip tracking params |
| Location | geonames-lite normalization to city/region (coarse feature only) |

### Stage 2 — Deterministic match

Exact hit on `candidate_identity (kind, value_norm)` for `email`, `phone`, `linkedin`, `external_id` → **auto-link** (`outcome = auto_linked`, score 1.0). New identifiers from the submission (e.g., a second email) are appended to the candidate's identity set — identities accrete over time, which is exactly how the "same candidate, different vendor, different email" case eventually becomes deterministic.

Collision guard: if the submission's identifiers hit **two different candidates** (email → candidate A, phone → candidate B), do *not* pick one — create a review item proposing an A↔B merge and link the submission provisionally to the stronger hit.

### Stage 3 — Blocking (candidate generation)

Never score against the whole table. Union of:

- `name_phonetic` equality (indexed)
- trigram name similarity `similarity(display_name, :name) > 0.45` (GIN index)
- shared normalized employer + same coarse location
- (M3+) top-20 nearest resume embeddings

Cap block size (default 50) with a metric on overflow.

### Stage 4 — Pairwise scoring

Weighted feature model producing `score ∈ [0,1]`. **Implemented weights**
(`packages/matching-core/src/score.ts`; phone match is already deterministic
via the `phone`/`phone_last10` identity kinds, and resume/DOB features arrive
with resume parsing in M4):

| Feature | Similarity | Weight (implemented) |
|---|---|---|
| Name | Jaro-Winkler on token-sorted, honorific-stripped norm | 0.45 |
| Email local-part | Jaro-Winkler (cross-domain) | 0.15 |
| Employer | exact-normalized, else token overlap | 0.20 |
| Title | Jaro-Winkler | 0.10 |
| Location | normalized equality | 0.10 |
| Resume text (M4) | MinHash/shingle or embedding cosine | planned |
| DOB / gov-id hash (if collected, M4) | exact binary | planned |

Missing features contribute **0** (conservative), never neutral. Thresholds:
`T_AUTO = 0.92` auto-link, `T_REVIEW = 0.70` queue floor. **Guard rule
(implemented + unit-tested):** name+location alone max out at 0.55 — a common
name in the same city can never auto-link; the protection is structural, not
tuned.

### Stage 5 — Ownership evaluation

Runs after link/new (see [03 §5](03-data-model.md) and [05 §4](05-vendor-portal-and-release.md)). Emits `submission.duplicate_flagged` when applicable.

## 3. Review queue (human-in-the-loop)

Recruiters/admins get a queue of `match_review_item`s with a side-by-side diff: identifiers, employment timeline, resumes, feature breakdown with per-feature bars, and both records' history. Actions:

- **Link** → submission joins existing candidate; new identifiers accrete; decision recorded with reviewer id.
- **Keep separate** → new candidate created; the *pair* is remembered as a negative example (`kept_separate`) so the engine stops re-asking (and negatives become future training data).
- **Merge masters** (admin-only) → for when two existing candidates are discovered to be one person. Snapshot stored in `merge_event` → **un-merge** restores the pre-merge state and re-links children. The merged record is kept (empty, `merged_into_id` set, excluded from blocking) so reversal is exact. Merging is refused with `application_collision` when both candidates hold an application on the same position — that pipeline contest must be resolved by a human first.

SLA hint: submissions in `pending_review` block vendor-facing duplicate feedback, so the queue surfaces age prominently and notifies on breach (default 24h).

## 4. Re-matching triggers

Matching isn't only at submission time:

- ✅ **Daily sweep** (`RematchSweepService`, also `POST /match-reviews/sweep`): re-scores existing candidate pairs and queues those that newly cross `T_REVIEW` because details accreted since they were created. Bounded per run (25 queued max); skips merged, erased, already-queued and human "kept separate" pairs so the queue never nags; either side of a pair can act as the review subject.
- ✅ **Erasure tombstone hit** → annotated on the match decision (`erased_record_existed`), never linked.
- Candidate identity edited/added → re-evaluate open review items touching that candidate *(pending)*.

## 5. Optional intelligence plugins (all off by default)

| Plugin | Interface | Notes |
|---|---|---|
| Resume embeddings | `EmbeddingProvider` (local model via Ollama/onnx, or API) | Feeds blocking + resume feature; pgvector HNSW |
| LLM adjudicator | `MatchAdjudicator` | For the review queue only: drafts a recommendation with cited evidence; never auto-decides |
| Resume parsing | `ResumeParser` (default: textract-style extraction + regex/heuristics) | Better parsing → better features |

## 6. Evaluation & test strategy

- `matching-core` ships with a labeled synthetic corpus (generated: name variants, transliterations, email permutations, shared-name distinct people) and a pytest-style eval harness reporting precision/recall at thresholds. CI fails if precision@auto-link < 0.995.
- Every real deployment accumulates labeled data from the review queue (`linked` / `kept_separate`) — an org-local eval set for threshold tuning, surfaced in an admin "matching quality" dashboard.

## 7. Erasure interplay (GDPR) — ✅ implemented

`DELETE /candidates/{id}` (admin-only, two-step: the body must echo the
candidate id) performs erasure:

| Step | What happens |
|---|---|
| Candidate PII | name → `[erased]`, title/employer/location nulled, `erased_at` stamped |
| Identities | rewritten to `kind='tombstone'` with `hmac_sha256(ERASURE_SALT, value_norm)`; raw value replaced |
| Vendor raw profiles | `raw_profile` redacted, vendor notes cleared (the second copy of the PII) |
| Attachments | resume metadata + extracted text deleted |
| Free text | scorecard notes and flag reasons → `[erased]` |
| Kept | submissions, applications, decisions, ownership timestamps, audit skeleton — so ownership windows and audit stay provable |

Matching never resurrects an erased record: both deterministic lookup and
trigram blocking exclude `erased_at IS NOT NULL`. A later submission whose
email hashes to a tombstone creates a **new** candidate and records
`erased_record_existed: true` on the match decision — admin-visible only,
which matters for ownership-window disputes. Rotating `ERASURE_SALT` makes
existing tombstones unmatchable (a legitimate hard-delete escalation).
