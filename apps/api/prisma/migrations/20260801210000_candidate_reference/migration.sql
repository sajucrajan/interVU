-- Human-readable candidate master id (CM-0428), the same convention as
-- position.reference. Nullable: erased tombstones keep theirs, and a row
-- created before this migration is backfilled below.
ALTER TABLE "candidate" ADD COLUMN "reference" TEXT;

-- Backfill in creation order, per organization.
WITH numbered AS (
    SELECT id,
           'CM-' || LPAD((ROW_NUMBER() OVER (
               PARTITION BY organization_id ORDER BY created_at, id
           ))::text, 4, '0') AS ref
    FROM "candidate"
)
UPDATE "candidate" c SET "reference" = n.ref FROM numbered n WHERE c.id = n.id;

CREATE UNIQUE INDEX "candidate_organization_id_reference_key"
    ON "candidate"("organization_id", "reference");
