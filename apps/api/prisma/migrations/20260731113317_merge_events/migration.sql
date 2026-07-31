-- DropIndex
DROP INDEX "candidate_name_trgm";

-- AlterTable
ALTER TABLE "candidate" ADD COLUMN     "merged_into_id" UUID;

-- CreateTable
CREATE TABLE "merge_event" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "surviving_candidate_id" UUID NOT NULL,
    "merged_candidate_id" UUID NOT NULL,
    "performed_by_id" UUID,
    "snapshot" JSONB NOT NULL,
    "reversed_at" TIMESTAMP(3),
    "reversed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merge_event_organization_id_idx" ON "merge_event"("organization_id");
