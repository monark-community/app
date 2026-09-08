-- Split row visibility out of `data-models.manage-schema`.
--
-- Until now `recordAccessContext` resolved its row-level-access `bypass` from
-- `data-models.manage-schema`, so "can add a field to a model" also meant "can
-- read every record in it, including rows restricted by DataRecordRoleAccess".
-- Those are different powers: an org may want a data steward who designs
-- schemas but cannot read HR / payroll / legal rows. Row visibility now has its
-- own capability, `data-models.view-all-records`.
--
-- This backfill is what makes the change a no-op on upgrade. Every role that
-- can see all records TODAY (by holding manage-schema) is granted the new
-- permission explicitly, so nothing disappears from anyone's list; the grant is
-- simply now revocable. Without this, the deploy would silently hide records
-- from roles that can currently see them.
--
-- Built-in ADMIN / SYSADMIN are deliberately NOT backfilled: `hasPermission`
-- short-circuits to true for them, so they need no stored row (and adding one
-- would imply the short-circuit could be revoked by deleting it, which it
-- cannot).
--
-- `gen_random_uuid()::text` matches the id-generation used by the earlier
-- data migration in 20260725210000_data_models_reserved_title_field. ON
-- CONFLICT makes the migration idempotent against a partially-seeded database.

INSERT INTO "RolePermission" ("id", "roleId", "module", "permission", "createdAt")
SELECT
  gen_random_uuid()::text,
  rp."roleId",
  'data-models',
  'view-all-records',
  now()
FROM "RolePermission" rp
WHERE rp."module" = 'data-models'
  AND rp."permission" = 'manage-schema'
ON CONFLICT ("roleId", "module", "permission") DO NOTHING;
