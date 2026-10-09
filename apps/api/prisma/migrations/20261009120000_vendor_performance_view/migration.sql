-- A read-only way into vendor performance (docs/09 §2).
--
-- The report was gated on vendors.manage, which also edits contracts, so the
-- only people who could read it were people who could change what it judged.
-- Everyone who manages vendors keeps the report; the new permission lets an
-- organization grant the report alone. Matched on the permission held rather
-- than a role name, since organizations rename their own roles.
UPDATE "role"
SET permissions = array_append(permissions, 'vendors.view_performance')
WHERE NOT ('vendors.view_performance' = ANY(permissions))
  AND 'vendors.manage' = ANY(permissions);
