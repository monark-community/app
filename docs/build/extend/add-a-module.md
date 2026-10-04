---
type: how-to
---

# Add a module

Create a new package that plugs into Monark, with its own procedures, events and pages. Decide its tier first: **extended** for a business feature, **core** only for infrastructure every deployment needs. See [Architecture](../../concepts/architecture/_index.md) for what each tier may depend on.

1. Scaffold the package; never build the folders by hand:
   ```sh
   pnpm gen:module <name> --tier extended
   pnpm install
   pnpm gen
   ```
   This creates `packages/<name>` with `/server`, `/client` and `/contracts` entry points and an empty router, and adds the module to `modules.manifest.ts`.
2. Add procedures to the `<name>Router` in `src/server/index.ts`. Validate every input with zod, and paginate every list (see `listDataRecords` in `packages/data-models/src/server/data.ts`).
3. Decide, for each platform system, whether the module uses it, and wire what applies:
   - [Register permissions](register-permissions.md) for every write.
   - [Emit a domain event](emit-a-domain-event.md) for every state change.
   - [Send a notification](send-a-notification.md) when a person should hear about something.
   - [Put a feature behind a flag](put-a-feature-behind-a-flag.md) if it ships in stages.
4. Call each `register…()` helper once in `services/api/src/server.ts`, in the block for its kind, next to the existing calls.
5. If the module needs tables, [change the database schema](change-the-database-schema.md) in its own fragment.
6. If it has a page, add it under `services/web/src/app/(authed)/<name>/`, add an entry to `services/web/src/config/primary-nav.ts`, and add `appBar.primaryNav.items.<name>` to every message catalog.
7. Write `packages/<name>/README.md` (copy the sections of `packages/rbac/README.md`), [write tests](write-tests.md) including an integration suite, and add a changelog fragment under `changelog.d/`.
8. Run the gate:
   ```sh
   pnpm agent gate
   ```
   `check:tiers` fails if an extended module imports another extended module; `check:modules` fails without the README, `contracts/events.ts` or the integration suite.

Good to know:

- Rerun `pnpm gen` whenever you change `contracts/events.ts` or the router. Never edit the generated files.
- Other packages import only `@monark/<name>/server`, `/client` or `/contracts`; anything else is private.

Next: [Register permissions](register-permissions.md)
