-- Direct vs vendor sourcing (docs/05 §8).
-- sourcing_mode defaults to 'vendor' and source_channel to 'vendor', so every
-- existing position and application keeps exactly today's behaviour.

CREATE TYPE "sourcing_mode" AS ENUM ('direct', 'vendor', 'hybrid');
CREATE TYPE "source_channel" AS ENUM ('careers', 'referral', 'vendor', 'internal', 'import');

ALTER TABLE "position" ADD COLUMN "sourcing_mode" "sourcing_mode" NOT NULL DEFAULT 'vendor';
ALTER TABLE "position" ADD COLUMN "vendor_opens_at" TIMESTAMP(3);

ALTER TABLE "application" ADD COLUMN "source_channel" "source_channel" NOT NULL DEFAULT 'vendor';
ALTER TABLE "application" ADD COLUMN "source_detail" TEXT;
ALTER TABLE "application" ADD COLUMN "referrer_org_user_id" UUID;

ALTER TABLE "vendor_org" ADD COLUMN "fee_percent" DECIMAL(5,2);
ALTER TABLE "offer" ADD COLUMN "start_date" TIMESTAMP(3);
ALTER TABLE "offer" ADD COLUMN "retained_90d" BOOLEAN;

-- A direct applicant has no vendor submission. Nullable rather than a
-- placeholder row, so nothing can mistake them for a vendor's candidate.
ALTER TABLE "application" ALTER COLUMN "source_submission_id" DROP NOT NULL;
