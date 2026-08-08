-- Shared question bank. Questions are tagged to SKILLS, not positions, so one
-- written for a role surfaces on every other role needing that competency.
CREATE TYPE "question_kind" AS ENUM ('technical', 'system_design', 'behavioural', 'situational');

CREATE TABLE "interview_question" (
  "id"              UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "prompt"          TEXT NOT NULL,
  "rubric"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "follow_ups"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "kind"            "question_kind" NOT NULL DEFAULT 'technical',
  "level"           INTEGER NOT NULL DEFAULT 3,
  "created_by_id"   UUID,
  "archived_at"     TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "interview_question_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "interview_question_organization_id_archived_at_idx"
  ON "interview_question"("organization_id", "archived_at");
ALTER TABLE "interview_question" ADD CONSTRAINT "interview_question_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "org_user"("id");

CREATE TABLE "interview_question_skill" (
  "question_id" UUID NOT NULL,
  "skill_id"    UUID NOT NULL,
  CONSTRAINT "interview_question_skill_pkey" PRIMARY KEY ("question_id", "skill_id")
);
ALTER TABLE "interview_question_skill" ADD CONSTRAINT "iqs_question_fkey"
  FOREIGN KEY ("question_id") REFERENCES "interview_question"("id") ON DELETE CASCADE;
ALTER TABLE "interview_question_skill" ADD CONSTRAINT "iqs_skill_fkey"
  FOREIGN KEY ("skill_id") REFERENCES "skill"("id") ON DELETE CASCADE;

-- One row per (question asked, rating that followed) — the data that says
-- which questions actually discriminate.
CREATE TABLE "interview_question_usage" (
  "id"           UUID NOT NULL,
  "question_id"  UUID NOT NULL,
  "interview_id" UUID NOT NULL,
  "skill_id"     UUID NOT NULL,
  "rating"       INTEGER,
  "asked_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "interview_question_usage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "iqu_question_interview_skill_key"
  ON "interview_question_usage"("question_id", "interview_id", "skill_id");
CREATE INDEX "iqu_question_idx" ON "interview_question_usage"("question_id");
ALTER TABLE "interview_question_usage" ADD CONSTRAINT "iqu_question_fkey"
  FOREIGN KEY ("question_id") REFERENCES "interview_question"("id") ON DELETE CASCADE;
