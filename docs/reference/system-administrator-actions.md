---
type: reference
---

# System administrator actions

<!-- source: tools/sysadmin.ts; packages/rbac/src/server/index.ts (adminAssignRole / adminRevokeRole refuse SYSADMIN);
packages/rbac/src/server/data.ts (findActiveAssignments: org-less checks match platform-tier assignments only);
packages/webhooks/src/server/router.ts; packages/files/src/server/index.ts (public buckets);
packages/feature-flags/src/server/index.ts (setOverride / removeOverride). -->

What only a system administrator can do. A system administrator holds every permission in every organization on the instance; everything else is open to an organization's administrators.

| Action                                                                                                    | Where it's done                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Make someone a system administrator, or remove the role                                                   | On the server: `pnpm sysadmin grant <email or user id>` and `pnpm sysadmin revoke <email or user id>`. Not possible in the app.                  |
| List the system administrators                                                                            | `pnpm sysadmin list`. Any administrator can also see the list, read-only, under **Admin** > **Roles & permissions** > **System administrators**. |
| Create and manage webhook endpoints that receive every event on the instance, not just one organization's | No screen in **Admin** today; endpoints created in **Admin** belong to your organization.                                                        |
| Make a storage bucket public, so its files are served from a public address                               | **Admin** > **Files** > **New bucket**.                                                                                                          |
| Set or remove a feature flag override for the whole instance                                              | No screen today.                                                                                                                                 |
