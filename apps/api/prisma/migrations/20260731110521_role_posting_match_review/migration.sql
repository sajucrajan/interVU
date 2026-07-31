-- CreateEnum
CREATE TYPE "seniority" AS ENUM ('junior', 'mid', 'senior', 'staff', 'principal');

-- CreateEnum
CREATE TYPE "employment_type" AS ENUM ('full_time', 'contract', 'contract_to_hire');

-- CreateEnum
CREATE TYPE "location_policy" AS ENUM ('onsite', 'hybrid', 'remote');

-- CreateEnum
CREATE TYPE "rate_period" AS ENUM ('hourly', 'daily', 'monthly', 'annual');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('open', 'linked', 'kept_separate');

-- CreateEnum
CREATE TYPE "proficiency" AS ENUM ('awareness', 'working', 'proficient', 'expert');

-- AlterTable
ALTER TABLE "position" ADD COLUMN     "employment_type" "employment_type" NOT NULL DEFAULT 'full_time',
ADD COLUMN     "location_policy" "location_policy",
ADD COLUMN     "location_text" TEXT,
ADD COLUMN     "min_total_years" INTEGER,
ADD COLUMN     "must_haves" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "rate_currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "rate_max" INTEGER,
ADD COLUMN     "rate_min" INTEGER,
ADD COLUMN     "rate_period" "rate_period",
ADD COLUMN     "seniority" "seniority";

-- AlterTable
ALTER TABLE "position_skill" ADD COLUMN     "min_years" INTEGER,
ADD COLUMN     "proficiency" "proficiency" NOT NULL DEFAULT 'working';

-- CreateTable
CREATE TABLE "match_review_item" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "candidate_id_suggested" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "feature_breakdown" JSONB NOT NULL,
    "status" "review_status" NOT NULL DEFAULT 'open',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_review_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_review_item_organization_id_status_idx" ON "match_review_item"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "match_review_item" ADD CONSTRAINT "match_review_item_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Fuzzy-name blocking (docs/04 §2.3): trigram index for candidate generation
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS candidate_name_trgm
  ON "candidate" USING gin ("display_name" gin_trgm_ops);
