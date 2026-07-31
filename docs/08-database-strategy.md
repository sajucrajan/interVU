# 08 — Database Strategy (ADR)

**Status:** accepted · **Decision:** one supported OLTP engine — PostgreSQL. Flexibility is provided at the *deployment and provider* level, and at the *analytics* level, not the engine level.

## The requirement

Organizations adopting InterVU want to run it against the database estate they already operate — cloud services (Azure, AWS, GCP), on-prem servers, or warehouses like Snowflake — rather than being forced onto unfamiliar infrastructure.

## Decision

InterVU's transactional core targets **PostgreSQL only** (any provider, any deployment). The requirement is met three ways:

### 1. Any cloud — via managed Postgres

InterVU connects through a single `DATABASE_URL`. Every major cloud offers first-party managed PostgreSQL, so "use our cloud" needs no code changes:

| Where the org runs | Use |
|---|---|
| Azure | **Azure Database for PostgreSQL – Flexible Server**, or **Azure Cosmos DB for PostgreSQL** (Citus — it *is* Postgres) |
| AWS | RDS for PostgreSQL / Aurora PostgreSQL |
| GCP | Cloud SQL for PostgreSQL / AlloyDB |
| Serverless/managed vendors | Neon, Supabase, Crunchy Bridge, … |
| On-prem / air-gapped | Self-hosted PostgreSQL on VMs or Kubernetes (InterVU has no external SaaS dependencies by design) |
| Laptop / evaluation | `docker compose up` ships Postgres — no database expertise required |

**Required extensions:** `pg_trgm`, `fuzzystrmatch` (both available on all providers above). **Optional:** `pgvector` (resume-embedding similarity, M4).

### 2. Warehouses (Snowflake etc.) — via the analytics export path

Snowflake, BigQuery, Redshift, and Synapse are **analytical** engines; running an interactive application on them is the wrong tool regardless of vendor. The real need — *"our BI and reporting live in the warehouse"* — is served by M4's **analytics export**: scheduled batch exports (and later CDC) of hiring-funnel data (positions, submissions, stage transitions, decisions, vendor stats — PII-minimized) into the org's warehouse of choice. This gives reporting teams full freedom without constraining the OLTP core.

### 3. Existing SQL Server / Oracle estates — via the same two answers

An org standardized on SQL Server or Oracle either (a) runs the bundled Postgres container/managed instance alongside — operationally equivalent to installing any packaged product that brings its own store — or (b) consumes InterVU data in their estate through the analytics export.

## Why not engine-level abstraction

1. **The matching engine is Postgres-shaped.** Fuzzy blocking (`pg_trgm` GIN indexes), phonetic keys (`dmetaphone`), generated columns, and optional `pgvector` are load-bearing for candidate identity resolution (docs/04). On document stores (MongoDB, Cosmos core API) or SQLite these features don't exist; the fallback is O(n) application-side scanning with worse match quality.
2. **Tenant isolation uses Postgres row-level security** as the defense-in-depth backstop against cross-vendor leakage (docs/02 §4). Losing it weakens the project's most security-critical guarantee.
3. **Correctness features** — transactions for ownership tie-breaking and merge/un-merge, partial unique constraints, `SELECT … FOR UPDATE` arbitration — map poorly onto document stores.
4. **Category mismatch:** Snowflake is OLAP, not OLTP; Cosmos/Mongo are document stores while the domain (ownership rules, release predicates, merges) is deeply relational; Oracle has no Prisma support at all.
5. **Community cost:** every extra engine multiplies the CI matrix and drags SQL to the lowest common denominator. The successful precedents in this product class — GitLab, Discourse, Sentry, Zulip, Mastodon — are all deliberately Postgres-only; multi-engine support is historically where open-source projects lose contributor velocity.

## Escape hatch (for a future community port)

We keep the door open without paying for it now:

- All Postgres-specific SQL is **confined to the matching module and migrations**; everything else goes through Prisma's engine-neutral API.
- If a community port (e.g., SQL Server, which Prisma does support) ever has real demand and a maintainer willing to own it, the boundary to abstract is documented here — but it is explicitly **out of scope for the core team**, and feature parity of the matching engine is not promised.
