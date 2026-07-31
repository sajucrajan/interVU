-- Read-only observer role scoped to verticals/units/teams (docs/09-entitlements.md §2)
ALTER TYPE "org_role" ADD VALUE IF NOT EXISTS 'project_manager';
