-- Panel debrief, per-competency scorecard ratings, and the feedback packet
-- that leaves the building (docs/05 §7).

CREATE TYPE "debrief_status" AS ENUM ('open', 'resolved');
CREATE TYPE "feedback_visibility" AS ENUM ('vendor', 'candidate', 'none');

-- One panelist's rating of ONE competency, so a loop resolves into a matrix.
CREATE TABLE "scorecard_competency" (
    "id" UUID NOT NULL,
    "scorecard_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "rating" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scorecard_competency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scorecard_competency_scorecard_id_skill_id_key"
    ON "scorecard_competency"("scorecard_id", "skill_id");
ALTER TABLE "scorecard_competency" ADD CONSTRAINT "scorecard_competency_scorecard_id_fkey"
    FOREIGN KEY ("scorecard_id") REFERENCES "scorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard_competency" ADD CONSTRAINT "scorecard_competency_skill_id_fkey"
    FOREIGN KEY ("skill_id") REFERENCES "skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "debrief" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "status" "debrief_status" NOT NULL DEFAULT 'open',
    "internal_reason" TEXT NOT NULL DEFAULT '',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "released_by_id" UUID,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "debrief_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "debrief_application_id_key" ON "debrief"("application_id");
CREATE INDEX "debrief_organization_id_status_idx" ON "debrief"("organization_id", "status");
ALTER TABLE "debrief" ADD CONSTRAINT "debrief_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No FK to scorecard, interview or org_user, and no numeric rating column:
-- redaction is a property of this table's shape, not of the serializer.
CREATE TABLE "feedback_packet" (
    "id" UUID NOT NULL,
    "debrief_id" UUID NOT NULL,
    "visibility" "feedback_visibility" NOT NULL DEFAULT 'none',
    "headline" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "strengths" TEXT[],
    "gaps" TEXT[],
    "reconsider_for" TEXT,
    "resubmit_after" TIMESTAMP(3),
    "is_draft" BOOLEAN NOT NULL DEFAULT true,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feedback_packet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feedback_packet_debrief_id_key" ON "feedback_packet"("debrief_id");
ALTER TABLE "feedback_packet" ADD CONSTRAINT "feedback_packet_debrief_id_fkey"
    FOREIGN KEY ("debrief_id") REFERENCES "debrief"("id") ON DELETE CASCADE ON UPDATE CASCADE;
