---
type: concept
---

# Generated code

Three files in the repository are built from module sources instead of written by hand. Each one would otherwise be a shared file that every new module had to edit, which is exactly what the module system avoids. A generator reads [modules.manifest.ts](../../../modules.manifest.ts), collects each module's piece, and writes the combined file.

## The three artifacts

| Artifact            | Built from                                                                                                                    | Written to                                          | Command            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------ |
| Prisma schema       | `packages/db/prisma/base.prisma` (datasource, generator, core models) plus every `packages/<module>/prisma/*.prisma` fragment | `packages/db/prisma/schema.prisma`                  | `pnpm gen:schema`  |
| `DomainEvent` union | the `XxxEvents` union in each module's `contracts/events.ts`                                                                  | `packages/common/src/contracts/events.generated.ts` | `pnpm gen:events`  |
| tRPC app router     | the router each module exports from `/server`                                                                                 | the API's `app-router.generated.ts`                 | `pnpm gen:routers` |

Generating the event union is what lets `emit` and `on` be fully typed without a dependency cycle. A hand-written union in `@monark/common` would have to import every module's contracts, while every module already imports `@monark/common`. The generator breaks that loop: each module owns its event types, and only the generated file sees them all.

`pnpm gen` runs all three in that order. It also runs before every build. A module missing from the manifest is invisible to all three generators, and a module without events or a router (Branding, for example) is skipped rather than failing.

## Drift is a build failure

The generated files are committed. CI regenerates each one with `--check`, which compares instead of writing, and fails if the committed file differs. So a generated file always matches its sources on `develop`, and a hand edit is caught at the first CI run, apart from being overwritten by the next `pnpm gen`.

The practical rule: after changing a module's events, router or schema fragment, run `pnpm gen` and commit what it produces. Never edit `schema.prisma` or a `*.generated.ts` file directly.

## Scaffolding

`pnpm gen:module <name> --tier core|extended` creates a new module package with the three entry points, its `package.json`, TypeScript and test configuration, and adds it to the manifest. The new module then needs its `register*` calls wired into the API's boot file; [Add a module](../../build/extend/add-a-module.md) walks through it.

## What isn't generated

The boot wiring is still written by hand. Every module's `register*` calls are listed in `services/api/src/server.ts`, which makes that file a merge hotspot when several modules land at once. See [How the API boots](api-boot-sequence.md).

## Related

- [Modules and tiers](modules-and-tiers.md)
- [Module boundaries](boundaries.md)
- [Change the database schema](../../build/extend/change-the-database-schema.md)
- [Scripts](../../reference/scripts.md)
