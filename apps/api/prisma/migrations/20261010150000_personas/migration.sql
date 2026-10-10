-- Personas: one person, several jobs, one at a time (docs/09 §7).
ALTER TABLE "org_user" ADD COLUMN "default_persona" TEXT;
ALTER TABLE "org_user" ADD COLUMN "ask_persona_at_login" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "session" ADD COLUMN "persona" TEXT;
ALTER TABLE "audit_log" ADD COLUMN "actor_persona" TEXT;
