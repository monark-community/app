# @monark/feature-flags

Server + client surface for feature-flag evaluation. Spec: [docs/features-planning/phase-1/feature-flags.md](../../docs/features-planning/phase-1/feature-flags.md).

## What's here

- `/contracts` — `FLAGS` constant, `FlagKey` type, `FlagFlippedEvent`, `FlagScope`.
- `/server` — `isEnabled`, `getFlags`, `setOverride`, `removeOverride`, `listFlagDefinitions`, `syncFlagsToDatabase`, plus the `featureFlagsRouter` tRPC sub-router.
- `/client` — `FlagsProvider`, `useFlag`, `useFlags`.

## Resolution order

Most-specific override wins. For each flag key, evaluation cascades:

1. User-scoped override (exact `userId` match)
2. Role-scoped override (user's active role)
3. Org-scoped override (active organization)
4. Global override (all scope fields null)
5. `defaultOn` from the flag definition in `FLAGS`

## Adding a new flag

1. Add an entry to `FLAGS` in [src/contracts/flags.ts](src/contracts/flags.ts) with a description and `defaultOn`.
2. Call `syncFlagsToDatabase()` (at boot in the api service, or manually) to upsert the corresponding `FeatureFlag` row.
3. Use `isEnabled("your-flag-key", { userId, organizationId, role })` on the server or `useFlag("your-flag-key")` on the client.

Removing a flag from `FLAGS` is safe: the DB row and any overrides stay but become orphans. Use the admin tooling (lands with the admin UI in a later pass) to prune.

## Database setup

This is the first Phase 1 module with real Prisma models. Before the module can read/write overrides you need:

1. A Postgres database reachable via `DATABASE_URL` + `DIRECT_URL` in `services/api/.env`. Use Supabase local (`supabase start`) or any Postgres instance.
2. Apply the schema:
   ```bash
   pnpm --filter @monark/db exec prisma migrate dev --name add-feature-flags
   ```
3. Seed the flag definitions:
   ```bash
   pnpm --filter @monark/db exec tsx -e "import('@monark/feature-flags/server').then(m => m.syncFlagsToDatabase()).then(() => process.exit(0))"
   ```
   Or wire `syncFlagsToDatabase()` into api startup so it runs automatically.

## Admin write path

`setOverride` and `removeOverride` accept an `actorId` argument today. Once `@monark/rbac` lands, this will be tightened to require an admin role on the calling session context. Search the module for the `TODO: once @monark/rbac lands` marker.

## Client hydration

`FlagsProvider` is a React context consumer. The intended pattern is:

```tsx
// Server component (e.g. app/layout.tsx)
import { getFlags } from "@monark/feature-flags/server"
import { FlagsProvider } from "@monark/feature-flags/client"
import { listFlagKeys } from "@monark/feature-flags/server"

export default async function Layout({ children }) {
  const flags = await getFlags(listFlagKeys(), { userId, organizationId, role })
  return <FlagsProvider flags={flags}>{children}</FlagsProvider>
}
```

Client components then read via `useFlag("voting")` without a network round-trip.
