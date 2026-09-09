-- Multi-tenancy support was removed : the app serves exactly one
-- organization, and many businesses are served by many instances (see
-- docs/technical-documentation/multi-instance.md).
--
-- `tenancy.multi-tenant` was the only flag in its namespace. Nothing
-- registers it any more, so its FeatureFlag row and any operator
-- overrides are orphaned: they would keep showing up in /admin/feature-flags
-- as an unknown flag nobody can act on.
--
-- Both module spellings are cleaned up. The flag was registered under
-- `tenancy` but an earlier module-namespace migration backfilled some
-- rows to `organizations`, so a deployment can hold either.
--
-- Overrides are removed by the FK's ON DELETE CASCADE, but they are
-- deleted explicitly first so the intent is readable and the statement
-- is correct even if that constraint is ever relaxed.

DELETE FROM "FeatureFlagOverride"
WHERE "flagKey" = 'multi-tenant'
  AND "module" IN ('tenancy', 'organizations');

DELETE FROM "FeatureFlag"
WHERE "key" = 'multi-tenant'
  AND "module" IN ('tenancy', 'organizations');
