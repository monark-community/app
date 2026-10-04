---
type: how-to
---

# Put a feature behind a flag

Ship a feature dark and turn it on per user, role, organization or everywhere, without a deploy.

1. Register the flag in `src/server/flags.ts`, and call the helper first in `services/api/src/server.ts`, in the feature-flags block:
   ```ts
   import { registerFlags } from "@monark/feature-flags/server";

   export function registerPostsFeatureFlags(): void {
     registerFlags("posts", {
       scheduling: { description: "Schedule posts to publish later.", defaultOn: false },
     });
   }
   ```
   New behaviour starts `defaultOn: false`. Use `true` only for a kill switch over something already shipped.
2. Check it on the server where the feature starts, in the caller's scope so overrides apply:
   ```ts
   const on = await isEnabled("posts.scheduling", { userId: ctx.userId, organizationId: org.id });
   if (!on) throw new ForbiddenError("Scheduling isn't enabled for this organization.");
   ```
   `isEnabled` comes from `@monark/feature-flags/server`, `ForbiddenError` from `@monark/common`.
3. In the web app, hide the entry point when the flag is off. A server component can read `featureFlags.getAllForSession` and call `notFound()`, as `services/web/src/app/(authed)/wiki/layout.tsx` does. A navigation entry takes a `flag` property in `services/web/src/config/primary-nav.ts`.
4. Turn it on locally: in `tools/enable-dev-flags.ts`, call your register helper next to the others and add the key to `DEV_FLAGS`, then run `pnpm enable:dev-flags`.

Good to know:

- The most specific override wins: user, then role, then organization, then global, then `defaultOn`.
- Hiding a button isn't protection. The server check in step 2 is the boundary.
- Never rename or reuse a shipped flag key.

Next: [Change the database schema](change-the-database-schema.md)
