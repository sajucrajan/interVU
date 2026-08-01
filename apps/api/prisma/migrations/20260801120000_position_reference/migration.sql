-- Human-readable position references (POS-001), unique per organization.
ALTER TABLE "position" ADD COLUMN "reference" TEXT;

-- Backfill existing rows in creation order, per organization.
WITH numbered AS (
  SELECT id,
         'POS-' || LPAD(
           ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id)::text,
           3, '0') AS ref
  FROM "position"
)
UPDATE "position" p SET "reference" = n.ref FROM numbered n WHERE p.id = n.id;

ALTER TABLE "position" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "position_organization_id_reference_key"
  ON "position"("organization_id", "reference");
