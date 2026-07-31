-- CreateEnum
CREATE TYPE "interview_status" AS ENUM ('scheduled', 'completed', 'canceled', 'no_show');

-- CreateEnum
CREATE TYPE "recommendation" AS ENUM ('strong_yes', 'yes', 'no', 'strong_no');

-- CreateEnum
CREATE TYPE "decision_outcome" AS ENUM ('offer', 'reject', 'hold');

-- CreateEnum
CREATE TYPE "flag_kind" AS ENUM ('do_not_hire', 'caution', 'note');

-- CreateTable
CREATE TABLE "interview" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "round_name" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "location_or_link" TEXT,
    "status" "interview_status" NOT NULL DEFAULT 'scheduled',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_panelist" (
    "id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "org_user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'interviewer',

    CONSTRAINT "interview_panelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "org_user_id" UUID NOT NULL,
    "overall_rating" INTEGER NOT NULL,
    "recommendation" "recommendation" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_transition" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_stage" TEXT NOT NULL,
    "to_stage" TEXT NOT NULL,
    "by_id" UUID,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_transition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "outcome" "decision_outcome" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_flag" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "kind" "flag_kind" NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_organization_id_scheduled_at_idx" ON "interview"("organization_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "interview_panelist_interview_id_org_user_id_key" ON "interview_panelist"("interview_id", "org_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "scorecard_interview_id_org_user_id_key" ON "scorecard"("interview_id", "org_user_id");

-- CreateIndex
CREATE INDEX "stage_transition_application_id_at_idx" ON "stage_transition"("application_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "decision_application_id_key" ON "decision"("application_id");

-- CreateIndex
CREATE INDEX "candidate_flag_candidate_id_idx" ON "candidate_flag"("candidate_id");

-- AddForeignKey
ALTER TABLE "interview" ADD CONSTRAINT "interview_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelist" ADD CONSTRAINT "interview_panelist_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panelist" ADD CONSTRAINT "interview_panelist_org_user_id_fkey" FOREIGN KEY ("org_user_id") REFERENCES "org_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard" ADD CONSTRAINT "scorecard_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard" ADD CONSTRAINT "scorecard_org_user_id_fkey" FOREIGN KEY ("org_user_id") REFERENCES "org_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_transition" ADD CONSTRAINT "stage_transition_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_flag" ADD CONSTRAINT "candidate_flag_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
