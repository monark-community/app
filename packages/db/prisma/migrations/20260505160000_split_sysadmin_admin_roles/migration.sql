-- Split the single built-in `ADMIN` role into two scope-locked
-- built-ins :
--   - `SYSADMIN` : platform-tier only, never assignable through the
--     admin UI ; granted via the `tools/sysadmin.ts` CLI or a direct
--     SQL insert. Implicit "all permissions across every org" via
--     code-side short-circuit.
--   - `ADMIN`    : org-tier only ; assignable through /admin/users
--     to grant per-org admin powers. Implicit "all permissions in
--     this org" via the same short-circuit.
--
-- This eliminates the previous overload where the same `ADMIN` row
-- backed both platform-tier and org-tier assignments depending on
-- the assignment's `organizationId`. Operators no longer have to
-- reason about "two admin permissions" sharing one definition ; one
-- role per scope, scope locked at the assignment layer.
--
-- Migration steps :
--   1. Insert the new SYSADMIN built-in row.
--   2. Repoint every existing platform-tier (organizationId IS NULL)
--      ADMIN assignment to the new SYSADMIN row.
--      Every other ADMIN assignment (org-tier) stays as-is.

INSERT INTO "Role" ("id", "key", "name", "description", "builtIn", "organizationId", "updatedAt")
VALUES (
    'role_sysadmin_builtin',
    'SYSADMIN',
    'System Administrator',
    'Platform-wide administrator with all permissions across every organization. Granted via the sysadmin CLI or direct database access ; never assignable through the admin UI.',
    true,
    NULL,
    CURRENT_TIMESTAMP
);

UPDATE "RoleAssignment"
SET "roleId" = 'role_sysadmin_builtin'
WHERE "organizationId" IS NULL
  AND "roleId" = 'role_admin_builtin';
