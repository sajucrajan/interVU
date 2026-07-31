-- CreateEnum
CREATE TYPE "identity_kind" AS ENUM ('email', 'phone', 'phone_last10', 'linkedin');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('received', 'accepted', 'pending_review', 'duplicate', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "ownership_status" AS ENUM ('owner', 'duplicate', 'arbitrated_owner', 'not_applicable');

-- CreateEnum
CREATE TYPE "application_status" AS ENUM ('active', 'hired', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "match_outcome" AS ENUM ('auto_linked', 'auto_new', 'reviewed_linked', 'reviewed_new');

-- AlterTable
ALTER TABLE "org_user" ADD COLUMN     "password_hash" TEXT;

-- AlterTable
ALTER TABLE "vendor_user" ADD COLUMN     "password_hash" TEXT;

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "org_user_id" UUID,
    "vendor_user_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "current_title" TEXT,
    "current_employer" TEXT,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_identity" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "kind" "identity_kind" NOT NULL,
    "value_norm" TEXT NOT NULL,
    "value_raw" TEXT NOT NULL,
    "source_submission_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "vendor_org_id" UUID NOT NULL,
    "vendor_user_id" UUID NOT NULL,
    "candidate_id" UUID,
    "raw_profile" JSONB NOT NULL,
    "status" "submission_status" NOT NULL DEFAULT 'received',
    "ownership_status" "ownership_status" NOT NULL DEFAULT 'not_applicable',
    "consent_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "expected_rate" TEXT,
    "vendor_notes" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "source_submission_id" UUID NOT NULL,
    "current_stage" TEXT NOT NULL DEFAULT 'submitted',
    "status" "application_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_decision" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "candidate_id" UUID,
    "outcome" "match_outcome" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "feature_breakdown" JSONB NOT NULL,
    "decided_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "candidate_organization_id_idx" ON "candidate"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_identity_organization_id_kind_value_norm_key" ON "candidate_identity"("organization_id", "kind", "value_norm");

-- CreateIndex
CREATE INDEX "submission_organization_id_position_id_idx" ON "submission"("organization_id", "position_id");

-- CreateIndex
CREATE INDEX "submission_organization_id_candidate_id_received_at_idx" ON "submission"("organization_id", "candidate_id", "received_at");

-- CreateIndex
CREATE INDEX "application_organization_id_status_idx" ON "application"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "application_position_id_candidate_id_key" ON "application"("position_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_decision_submission_id_key" ON "match_decision"("submission_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_org_user_id_fkey" FOREIGN KEY ("org_user_id") REFERENCES "org_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_vendor_user_id_fkey" FOREIGN KEY ("vendor_user_id") REFERENCES "vendor_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_identity" ADD CONSTRAINT "candidate_identity_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_vendor_org_id_fkey" FOREIGN KEY ("vendor_org_id") REFERENCES "vendor_org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_vendor_user_id_fkey" FOREIGN KEY ("vendor_user_id") REFERENCES "vendor_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission" ADD CONSTRAINT "submission_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_decision" ADD CONSTRAINT "match_decision_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
