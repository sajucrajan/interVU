-- A human judgement on the question, separate from what its usage shows.
CREATE TABLE "interview_question_vote" (
  "question_id" UUID NOT NULL,
  "org_user_id" UUID NOT NULL,
  "value"       INTEGER NOT NULL,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "interview_question_vote_pkey" PRIMARY KEY ("question_id", "org_user_id")
);
CREATE INDEX "iqv_question_idx" ON "interview_question_vote"("question_id");
ALTER TABLE "interview_question_vote" ADD CONSTRAINT "iqv_question_fkey"
  FOREIGN KEY ("question_id") REFERENCES "interview_question"("id") ON DELETE CASCADE;
ALTER TABLE "interview_question_vote" ADD CONSTRAINT "iqv_org_user_fkey"
  FOREIGN KEY ("org_user_id") REFERENCES "org_user"("id") ON DELETE CASCADE;
