-- Roles become org-defined permission bundles instead of a fixed enum, so an
-- organization can express its own hierarchy (program manager, RTE, managing
-- director) without a code change. The five built-ins become `is_system` rows.

CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_organization_id_key_key" ON "role"("organization_id", "key");

ALTER TABLE "role" ADD CONSTRAINT "role_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the built-ins for every existing organization. Permission lists mirror
-- SYSTEM_ROLES in src/entitlements/permissions.ts; migrations are historical
-- snapshots, so they are spelled out here rather than imported.
INSERT INTO "role" ("id", "organization_id", "key", "name", "description", "permissions", "is_system", "updated_at")
SELECT
    gen_random_uuid(), o.id, r.key, r.name, r.description, r.permissions, true, CURRENT_TIMESTAMP
FROM "organization" o
CROSS JOIN (VALUES
    ('org_admin', 'Organization admin', 'Full control, including people, structure, vendors and settings.', ARRAY[
        'positions.view','positions.create','positions.publish','positions.release',
        'submissions.view','submissions.arbitrate','candidates.view_history','candidates.merge',
        'candidates.flag','applications.transition','interviews.schedule','panels.manage',
        'decisions.record','vendors.manage','org.manage_structure','org.manage_users','org.settings']),
    ('recruiter', 'Recruiter', 'Runs hiring day to day: posts roles, arbitrates duplicates, moves candidates.', ARRAY[
        'positions.view','positions.create','positions.publish','positions.release',
        'submissions.view','submissions.arbitrate','candidates.view_history','candidates.merge',
        'candidates.flag','applications.transition','interviews.schedule','panels.manage']),
    ('hiring_manager', 'Hiring manager', 'Owns the outcome for their teams: reviews candidates and records decisions.', ARRAY[
        'positions.view','submissions.view','candidates.view_history','applications.transition',
        'interviews.schedule','panels.manage','decisions.record']),
    ('project_manager', 'Project manager', 'Read-only visibility into positions and pipeline for their scope.', ARRAY[
        'positions.view','submissions.view']),
    ('interviewer', 'Interviewer', 'Submits scorecards for interviews they are on the panel of.', ARRAY[
        'scorecards.submit'])
) AS r(key, name, description, permissions);

-- Repoint memberships at the new roles, preserving every existing grant.
ALTER TABLE "org_membership" ADD COLUMN "role_id" UUID;

UPDATE "org_membership" m
SET "role_id" = r.id
FROM "role" r, "org_user" u
WHERE m."org_user_id" = u."id"
  AND r."organization_id" = u."organization_id"
  AND r."key" = m."role"::text;

-- Nothing may be left behind: a membership without a role grants nothing.
DO $$
DECLARE orphaned INT;
BEGIN
    SELECT count(*) INTO orphaned FROM "org_membership" WHERE "role_id" IS NULL;
    IF orphaned > 0 THEN
        RAISE EXCEPTION 'org_membership rows without a role after backfill: %', orphaned;
    END IF;
END $$;

ALTER TABLE "org_membership" ALTER COLUMN "role_id" SET NOT NULL;

ALTER TABLE "org_membership" DROP CONSTRAINT IF EXISTS "org_membership_org_user_id_org_unit_id_role_key";
DROP INDEX IF EXISTS "org_membership_org_user_id_org_unit_id_role_key";
ALTER TABLE "org_membership" DROP COLUMN "role";
DROP TYPE "org_role";

CREATE UNIQUE INDEX "org_membership_org_user_id_org_unit_id_role_id_key"
    ON "org_membership"("org_user_id", "org_unit_id", "role_id");
CREATE INDEX "org_membership_role_id_idx" ON "org_membership"("role_id");

ALTER TABLE "org_membership" ADD CONSTRAINT "org_membership_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "role"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
