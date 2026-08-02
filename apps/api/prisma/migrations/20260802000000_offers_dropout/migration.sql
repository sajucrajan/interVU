-- Offers and dropout (handoff items #16 and #7). Between them these make
-- offer accept rate, the funnel's Hired row, the "above band" flag and vendor
-- dropout % real instead of blank.

CREATE TYPE "rate_band_fit" AS ENUM ('below', 'in', 'above');
CREATE TYPE "decline_reason" AS ENUM (
    'compensation', 'counter_offer', 'competing_offer',
    'role_scope', 'location', 'timing', 'other'
);
CREATE TYPE "dropout_kind" AS ENUM ('withdrew', 'unresponsive', 'declined_offer');

CREATE TABLE "offer" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "vs_rate_band" "rate_band_fit",
    "extended_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "declined_reason" "decline_reason",
    "declined_note" TEXT NOT NULL DEFAULT '',
    "created_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "offer_application_id_key" ON "offer"("application_id");
CREATE INDEX "offer_organization_id_accepted_at_idx" ON "offer"("organization_id", "accepted_at");
ALTER TABLE "offer" ADD CONSTRAINT "offer_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "application"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dropout is the candidate leaving, which is not the same as being rejected.
ALTER TABLE "application" ADD COLUMN "dropout_kind" "dropout_kind";
ALTER TABLE "application" ADD COLUMN "dropout_at_stage" TEXT;
ALTER TABLE "application" ADD COLUMN "dropout_at" TIMESTAMP(3);
