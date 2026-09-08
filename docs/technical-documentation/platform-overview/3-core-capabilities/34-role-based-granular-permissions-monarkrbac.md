# 3.4 Role-based, granular permissions (`@monark/rbac`)

Fully **table-driven** (no role enum): `Role` (`key`, `builtIn`, nullable `organizationId` ; null = platform-wide), `RolePermission` (`(roleId, module, permission)`), `RoleAssignment` (`userId`, nullable `organizationId`, `roleId`, grant/revoke audit). Two reserved built-in roles short-circuit `hasPermission` to true: **`ADMIN`** (org-tier) and **`SYSADMIN`** (platform-tier, assignable only via `tools/sysadmin.ts` / SQL, never the UI ; auto-grants across every org).

- **Registration**: `registerPermissions(module, { key: { description, category, orgScoped? } })` at boot into an in-memory registry ; call sites use the dotted form `requirePermission(ctx, "<module>.<key>", orgId)`. New permissions auto-grant to admins (the short-circuit) and surface in `/admin/rbac` automatically.
- **Org-scoped visibility**: `registerOrgScopedPermissionVisibility` lets `orgScoped` permissions (e.g. per-Data-Model record permissions) stay globally registered while only showing an org the keys a resolver reports for it ; so one org's model keys never leak into another's picker.
- **Write path**: `assignRole` / `revokeRole` (scope-enforced ; SYSADMIN not grantable via UI), custom-role CRUD ; events `rbac.role-assigned`/`-revoked`/`-created`/`-updated`/`-deleted`.
- **UI**: `/admin/rbac` (roles manager + permission matrix + read-only SYSADMIN roster).

The three built-in admin routers (users/organizations/rbac) currently gate their admin procedures via an ADMIN-tier short-circuit helper ; the named permissions they register are for server-to-server callers and appear in the matrix.
