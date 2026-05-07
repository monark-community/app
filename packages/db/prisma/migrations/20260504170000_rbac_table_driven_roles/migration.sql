-- RBAC table-driven roles migration.
--
-- Replaces the `Role` Prisma enum with a `Role` table + a `RolePermission`
-- join. Seeds a single built-in row (`key = 'ADMIN'`, `builtIn = true`,
-- `organizationId = NULL`) ; drops the old enum entirely. Custom roles are
-- defined per-org via `Role` rows where `organizationId IS NOT NULL`.
--
-- DESTRUCTIVE on populated databases :
--   - `RoleAssignment` rows where `role IN ('DEVELOPER', 'AMBASSADOR', 'STUDENT')`
--     are deleted (those enum values disappear).
--   - `Invite` rows for the same retired roles are deleted.
--   - `FeatureFlagOverride` rows scoped to those retired roles are deleted.
--   - `RoleAssignment` rows with `role IN ('MONARK_ADMIN', 'ADMIN')` are
--     repointed at the new built-in ADMIN row.
--
-- The user explicitly approved this for the starter codebase (no real
-- production data yet). On a populated install, each retired-role
-- assignment would need a per-org backfill into a custom Role row before
-- this migration runs.
--
-- ── Order rationale ─────────────────────────────────────────────
-- Postgres puts table names and type names in the same namespace, so
-- creating a `CREATE TABLE "Role"` while the `Role` enum still exists
-- fails with "type already exists". The migration therefore :
--   1. Adds `roleId` columns to the three tables that referenced the
--      old enum (still nullable, no FK to a not-yet-existing table).
--   2. Backfills `roleId = 'role_admin_builtin'` for the kept rows
--      using the *old* enum values, then deletes rows for retired
--      values. The sentinel string isn't validated yet — no FK.
--   3. Drops the old `role` columns, the unique indexes that keyed on
--      them, and finally the `Role` enum type (frees the namespace).
--   4. Creates the `Role` + `RolePermission` tables, seeds the
--      built-in ADMIN row at the matching sentinel id.
--   5. Tightens : sets `roleId` NOT NULL where required, adds the
--      new FKs + unique indexes.
--
-- The Organization → RoleAssignment ON DELETE CASCADE is preserved
-- end-to-end so deleting an org still removes its role assignments
-- together (no "deleted org / null orgId / accidental platform admin"
-- path).

-- 1. Add the new `roleId` columns. Nullable for now ; tightened in step 5.
ALTER TABLE "RoleAssignment"     ADD COLUMN "roleId" TEXT;
ALTER TABLE "Invite"             ADD COLUMN "roleId" TEXT;
ALTER TABLE "FeatureFlagOverride" ADD COLUMN "roleId" TEXT;

-- 2. Backfill : MONARK_ADMIN + ADMIN → the built-in ADMIN sentinel id.
-- The id is hardcoded so the row created in step 4 picks up these
-- references via the FK we add in step 5. Code-side reads of "the
-- ADMIN row" should always look it up by `key = 'ADMIN' AND
-- "builtIn" = true` instead of hardcoding this id.
UPDATE "RoleAssignment"      SET "roleId" = 'role_admin_builtin' WHERE "role" IN ('MONARK_ADMIN', 'ADMIN');
UPDATE "Invite"              SET "roleId" = 'role_admin_builtin' WHERE "role" IN ('MONARK_ADMIN', 'ADMIN');
UPDATE "FeatureFlagOverride" SET "roleId" = 'role_admin_builtin' WHERE "role" IN ('MONARK_ADMIN', 'ADMIN');

-- 3. Drop rows referencing retired enum values (DEVELOPER, AMBASSADOR, STUDENT).
DELETE FROM "RoleAssignment" WHERE "roleId" IS NULL;
DELETE FROM "Invite"         WHERE "roleId" IS NULL;
-- FeatureFlagOverride : role-scoped overrides for retired roles only.
-- User-scoped, org-scoped, and global overrides have role/roleId NULL by
-- design and must NOT be deleted.
DELETE FROM "FeatureFlagOverride"
    WHERE "role" IS NOT NULL AND "roleId" IS NULL;

-- 4. Drop the old constraints + columns + enum type. After this the
-- `Role` namespace name is free.
ALTER TABLE "RoleAssignment" DROP CONSTRAINT IF EXISTS "RoleAssignment_userId_organizationId_role_key";
DROP INDEX IF EXISTS "RoleAssignment_userId_organizationId_role_key";
DROP INDEX IF EXISTS "FeatureFlagOverride_flagKey_organizationId_userId_role_key";

ALTER TABLE "RoleAssignment"      DROP COLUMN "role";
ALTER TABLE "Invite"              DROP COLUMN "role";
ALTER TABLE "FeatureFlagOverride" DROP COLUMN "role";

DROP TYPE IF EXISTS "Role";

-- 5. Create the new Role table now that the namespace name is free.
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Role_key_organizationId_key" ON "Role"("key", "organizationId");
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");

ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_roleId_permission_key" ON "RolePermission"("roleId", "permission");
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Seed the built-in ADMIN row at the sentinel id the step-2 backfill
-- already pointed at.
INSERT INTO "Role" ("id", "key", "name", "description", "builtIn", "organizationId", "updatedAt")
VALUES (
    'role_admin_builtin',
    'ADMIN',
    'Administrator',
    'System administrator with full access to every permission. Cannot be deleted ; permissions cannot be edited.',
    true,
    NULL,
    CURRENT_TIMESTAMP
);

-- 7. Tighten roleId nullability where the FK is required.
-- (FeatureFlagOverride.roleId stays nullable — role-scoped overrides
-- are one of three mutually exclusive scope kinds.)
ALTER TABLE "RoleAssignment" ALTER COLUMN "roleId" SET NOT NULL;
ALTER TABLE "Invite"         ALTER COLUMN "roleId" SET NOT NULL;

-- 8. Recreate the unique constraints + indexes that key on roleId now.
CREATE UNIQUE INDEX "RoleAssignment_userId_organizationId_roleId_key"
    ON "RoleAssignment"("userId", "organizationId", "roleId");
CREATE INDEX "RoleAssignment_roleId_idx" ON "RoleAssignment"("roleId");

CREATE INDEX "Invite_roleId_idx" ON "Invite"("roleId");

CREATE UNIQUE INDEX "FeatureFlagOverride_flagKey_organizationId_userId_roleId_key"
    ON "FeatureFlagOverride"("flagKey", "organizationId", "userId", "roleId");

-- 9. Add the FKs.
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Invite" ADD CONSTRAINT "Invite_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FeatureFlagOverride" ADD CONSTRAINT "FeatureFlagOverride_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
