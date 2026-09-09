# @monark/feature-flags

Server + client surface for feature-flag evaluation. Spec: [docs/features-planning/phase-1/feature-flags.md](../../docs/features-planning/phase-1/feature-flags.md).

## What's here

- `/contracts` — `registerFlags`, `isKnownFlag`, `parseFlagKey`, `listFlagDescriptors`, plus the `FlagFlippedEvent` + `FlagScope` types.
- `/server` — `isEnabled`, `getFlags`, `setOverride`, `removeOverride`, `listFlagDefinitions`, `syncFlagsToDatabase`, re-exports `registerFlags`, plus the `featureFlagsRouter` tRPC sub-router.
- `/client` — `FlagsProvider`, `useFlag`, `useFlags`.

## Module-namespacing

Flags are runtime-registered. The DB stores `(module, key)` and the call-site uses the dotted form `"<module>.<key>"`. Any module — core or extended — registers its flags at api boot by calling `registerFlags(moduleName, flags)`. Two modules can declare a key with the same suffix without colliding because the unique key is the `(module, key)` pair.

Core registrations live in each owning module's server package and are wired in [services/api/src/server.ts](../../services/api/src/server.ts) :

- `auth.*` — registered by `registerAuthFeatureFlags()` in [@monark/auth/server](../auth/src/server/flags.ts).

An extended module follows the same shape :

```ts
// packages/posts/src/server/flags.ts
import { registerFlags } from "@monark/feature-flags/server";

export function registerPostsFeatureFlags(): void {
  registerFlags("posts", {
    "drafts-enabled": {
      description: "Allow saving posts as drafts before publishing.",
      defaultOn: true,
    },
  });
}
```

Then [services/api/src/server.ts](../../services/api/src/server.ts) calls it once at boot, before `syncFlagsToDatabase()`.

## Resolution order

Most-specific override wins. For each flag key, evaluation cascades :

1. User-scoped override (exact `userId` match)
2. Role-scoped override (active role on the caller)
3. Org-scoped override (active organization)
4. Global override (all scope fields null)
5. `defaultOn` from the registered flag definition

If no module ever registered the dotted key, `isEnabled` returns `false`.

## Adding a new flag

1. Add an entry to your module's `flags.ts` registration helper (see core examples above).
2. Make sure the helper is invoked from [services/api/src/server.ts](../../services/api/src/server.ts) at boot, before `syncFlagsToDatabase()` runs.
3. Use `isEnabled("posts.drafts-enabled", { userId, organizationId, roleId })` on the server or `useFlag("posts.drafts-enabled")` on the client.

Removing a registration is safe : the DB row and any overrides remain but become orphans. Use the admin tooling to prune.

## Database setup

1. A Postgres database reachable via `DATABASE_URL` + `DIRECT_URL` in `services/api/.env`. Use Supabase local (`supabase start`) or any Postgres instance.
2. Apply the schema :
   ```bash
   pnpm --filter @monark/db db:migrate:dev
   ```
3. Boot the api once ; `syncFlagsToDatabase()` upserts a `FeatureFlag` row per registration.

## Admin write path

`setOverride` and `removeOverride` accept an `actorId` argument today. Once `@monark/rbac` admin guards land at the tRPC layer, the actor is sourced from the request context.

## Client hydration

`FlagsProvider` is a React context consumer. The intended pattern is :

```tsx
// Server component (e.g. app/layout.tsx)
import { getFlags, listFlagKeys } from "@monark/feature-flags/server";
import { FlagsProvider } from "@monark/feature-flags/client";

export default async function Layout({ children }) {
  const flags = await getFlags(listFlagKeys(), { userId, organizationId, roleId });
  return <FlagsProvider flags={flags}>{children}</FlagsProvider>;
}
```

Client components then read via `useFlag("posts.drafts-enabled")` without a network round-trip.
