---
type: how-to
---

# Register permissions

Make an action in your module grantable per role, so admins decide who can do it. Every write path checks a permission; never compare role names.

1. Declare the module's permissions in `src/server/permissions.ts`:
   ```ts
   import { registerPermissions } from "@monark/rbac/server";

   export function registerPostsPermissions(): void {
     registerPermissions("posts", {
       view: { description: "View posts.", category: "posts" },
       publish: { description: "Publish a draft post.", category: "posts" },
     });
   }
   ```
   The module name is the package name without `@monark/`. Keys are lowercase with dashes. The description is plain English and isn't translated.
2. Export the helper from `src/server/index.ts` and call it in `services/api/src/server.ts`, in the permissions block.
3. Guard the procedure before it does anything:
   ```ts
   const org = await requireOrg({ userId: ctx.userId, activeOrganizationId: ctx.activeOrganizationId });
   const actorId = await requirePermission(ctx, "posts.publish", org.id);
   ```
   `requirePermission` throws a forbidden error when the user lacks it, and returns their user id.
4. Start the api and open **Admin**, then **Roles & permissions**. Your permissions appear under their category, ready to grant.

Good to know:

- Admins and system administrators have every permission automatically, including new ones; nothing to backfill.
- To show or hide a button in the web app, read the user's permissions with `rbac.myPermissions` and check for the key. The server check is still the real boundary.
- Never rename or reuse a shipped permission key. Add a new one instead.

Next: [Emit a domain event](emit-a-domain-event.md)
