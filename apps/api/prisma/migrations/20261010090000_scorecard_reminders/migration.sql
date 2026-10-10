-- Scorecard reminders: when each panelist was nudged, per interview.
ALTER TABLE "interview_panelist" ADD COLUMN "reminder_fresh_at" TIMESTAMP(3);
ALTER TABLE "interview_panelist" ADD COLUMN "reminder_overdue_at" TIMESTAMP(3);
