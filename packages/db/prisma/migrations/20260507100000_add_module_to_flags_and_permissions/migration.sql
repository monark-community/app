-- Module-namespacing for feature flags + RBAC permissions.
--
-- Rationale : extended (non-core) modules need to register their own
-- flags + permissions without colliding on slug alone with core. After
-- this migration, FeatureFlag is keyed on (module, key) and
-- RolePermission is keyed on (roleId, module, permission). Two modules
-- can both declare a `posts.publish` flag or a `posts:write`
-- permission without stepping on each other.
--
-- Backfill is data-correct for the existing core registry. Two
-- different conventions for the module column :
--
--   FeatureFlag (module = the dotted-key namespace, so resolution
--   stays ergonomic — `isEnabled("auth.trusted-devices")` parses to
--   module `auth` + key `trusted-devices`) :
--     `auth.*`     → module `auth`
--     `tenancy.*`  → module `tenancy` (registered by @monark/organizations)
--
--   RolePermission (module = the registering package, since
--   permission slugs aren't dotted-keyed) :
--     `org:update-settings` / `org:invite-member` / `org:remove-member`
--       → module `organizations`
--     `org:assign-role` / `org:assign-admin-role` / `rbac:manage-roles`
--       → module `rbac`
--     `feature-flags:read` / `feature-flags:write`
--       → module `feature-flags`
--     `user:disable`
--       → module `users`
--     anything else falls back to the prefix before the colon.
--
-- The migration is non-destructive : existing rows survive with the
-- correct module set, all FKs are recreated to point at the compound
-- key, and unique constraints widen rather than tighten.

-- ── Feature flags ─────────────────────────────────────────────

-- Split the existing dotted `key` into `(module, key)`. Pre-migration,
-- a flag stored as `auth.trusted-devices` becomes `module='auth'`,
-- `key='trusted-devices'`. The dotted form remains the call-site
-- ergonomic ; the DB now stores the parts separately.
ALTER TABLE "FeatureFlag" ADD COLUMN "module" TEXT NOT NULL DEFAULT '';
UPDATE "FeatureFlag" SET
    "module" = SPLIT_PART("key", '.', 1),
    "key"    = SUBSTRING("key" FROM POSITION('.' IN "key") + 1)
    WHERE POSITION('.' IN "key") > 0;
ALTER TABLE "FeatureFlag" ALTER COLUMN "module" DROP DEFAULT;

ALTER TABLE "FeatureFlagOverride" ADD COLUMN "module" TEXT NOT NULL DEFAULT '';
UPDATE "FeatureFlagOverride" SET
    "module"  = SPLIT_PART("flagKey", '.', 1),
    "flagKey" = SUBSTRING("flagKey" FROM POSITION('.' IN "flagKey") + 1)
    WHERE POSITION('.' IN "flagKey") > 0;
ALTER TABLE "FeatureFlagOverride" ALTER COLUMN "module" DROP DEFAULT;

-- Drop the old constraints that key on `flagKey` alone.
ALTER TABLE "FeatureFlagOverride" DROP CONSTRAINT "FeatureFlagOverride_flagKey_fkey";
DROP INDEX "FeatureFlagOverride_flagKey_organizationId_userId_roleId_key";
DROP INDEX "FeatureFlagOverride_flagKey_idx";
ALTER TABLE "FeatureFlag" DROP CONSTRAINT "FeatureFlag_pkey";

-- Recreate with the compound (module, key) shape.
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("module", "key");

ALTER TABLE "FeatureFlagOverride"
    ADD CONSTRAINT "FeatureFlagOverride_module_flagKey_fkey"
    FOREIGN KEY ("module", "flagKey") REFERENCES "FeatureFlag"("module", "key")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FeatureFlagOverride_module_flagKey_organizationId_userId_roleId_key"
    ON "FeatureFlagOverride"("module", "flagKey", "organizationId", "userId", "roleId");
CREATE INDEX "FeatureFlagOverride_module_flagKey_idx"
    ON "FeatureFlagOverride"("module", "flagKey");

-- ── RBAC permissions ──────────────────────────────────────────

-- Add module column + strip the legacy colon prefix from the slug.
-- Both expressions on the RHS see the row's pre-UPDATE values, so
-- deriving `module` from the old `permission` and rewriting
-- `permission` to its suffix in one statement is safe.
ALTER TABLE "RolePermission" ADD COLUMN "module" TEXT NOT NULL DEFAULT '';
UPDATE "RolePermission" SET
    "module" = CASE
        WHEN "permission" IN ('org:update-settings', 'org:invite-member', 'org:remove-member')
            THEN 'organizations'
        WHEN "permission" IN ('org:assign-role', 'org:assign-admin-role', 'rbac:manage-roles')
            THEN 'rbac'
        WHEN "permission" IN ('feature-flags:read', 'feature-flags:write')
            THEN 'feature-flags'
        WHEN "permission" = 'user:disable'
            THEN 'users'
        ELSE SPLIT_PART("permission", ':', 1)
    END,
    "permission" = CASE
        WHEN POSITION(':' IN "permission") > 0
            THEN SUBSTRING("permission" FROM POSITION(':' IN "permission") + 1)
        ELSE "permission"
    END;
ALTER TABLE "RolePermission" ALTER COLUMN "module" DROP DEFAULT;

DROP INDEX IF EXISTS "RolePermission_roleId_permission_key";
CREATE UNIQUE INDEX "RolePermission_roleId_module_permission_key"
    ON "RolePermission"("roleId", "module", "permission");
