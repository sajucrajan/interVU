-- Per-competency notes: a rating with no reason is the thing a debrief
-- cannot argue with.
ALTER TABLE "scorecard_competency" ADD COLUMN "note" TEXT;

-- Notes taken during the interview, autosaved. Separate from scorecard so a
-- draft can never be mistaken for a filed opinion by hide-until-submitted.
CREATE TABLE "scorecard_draft" (
  "id"              UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "interview_id"    UUID NOT NULL,
  "org_user_id"     UUID NOT NULL,
  "payload"         JSONB NOT NULL DEFAULT '{}',
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scorecard_draft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "scorecard_draft_interview_id_org_user_id_key"
  ON "scorecard_draft"("interview_id", "org_user_id");
ALTER TABLE "scorecard_draft" ADD CONSTRAINT "scorecard_draft_interview_id_fkey"
  FOREIGN KEY ("interview_id") REFERENCES "interview"("id") ON DELETE CASCADE;
ALTER TABLE "scorecard_draft" ADD CONSTRAINT "scorecard_draft_org_user_id_fkey"
  FOREIGN KEY ("org_user_id") REFERENCES "org_user"("id") ON DELETE CASCADE;
