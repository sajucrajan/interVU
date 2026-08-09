-- Roles are rows (docs/09 §2), so a new permission in the code reaches nobody
-- until it is added to the roles that should hold it.
--
-- Recruiters screen candidates, so recruiters reject at screening. Anyone who
-- can already record a hire/no-hire decision can obviously do the lesser act
-- too. Matched on the permission they hold rather than on a role NAME, since
-- organizations rename and redefine their own roles.
UPDATE "role"
SET permissions = array_append(permissions, 'applications.reject')
WHERE NOT ('applications.reject' = ANY(permissions))
  AND (
    'decisions.record' = ANY(permissions)
    OR ('applications.transition' = ANY(permissions) AND 'submissions.arbitrate' = ANY(permissions))
  );
