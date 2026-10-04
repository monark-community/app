---
type: concept
---

# Modules and tiers

Every feature in Monark is a workspace package under `packages/`, and the package boundary is the module boundary. Modules come in two tiers, core and extended, declared in one manifest that the code generators and the boundary checks both read.

## What a module is

A feature module is a package named `@monark/<name>` with up to three entry points, and nothing else is importable from outside it:

| Entry point  | Holds                                                                      | Imported by                              |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------- |
| `/server`    | the module's tRPC router, data access, event handlers, `register*` helpers | `services/api`, other modules' `/server` |
| `/client`    | React components and hooks                                                 | `services/web`, other modules' `/client` |
| `/contracts` | zod schemas, shared types, and the module's domain event types             | both sides                               |

Because a package's `exports` field lists only these paths, reaching into another module's internals fails at module resolution; no lint rule is needed for that case. A module without a UI (Files, for example) omits `/client`.

Core modules also export read interfaces from `/server`: functions such as "get user by id" or "check permission" that other modules call for data they need but don't own.

## Two tiers

[modules.manifest.ts](../../../modules.manifest.ts) lists every feature module with its tier:

- Core modules ship with every deployment. They may depend on each other and on the infrastructure packages. The bar for joining core is high, because every deployment loads every core module.
- Extended modules add business features on top. They may depend on any core module but never on another extended module. Removing one compiles and passes tests with no change to the others.

The rule of thumb: if it's infrastructure every feature needs (identity, permissions, storage, communications), it's core. If it's a feature some deployments might not want, it's extended. Two extended modules that need to share something compose through core: the event bus, a core read interface, or the metadata sidecar. If that isn't enough, the shared concept moves into core.

An extended module can also be marked as an integration of a core module (`integrates: "@monark/automation"` in the manifest). That's metadata, not a third tier; see [Integration modules](integration-modules.md).

The current membership of each tier is in [Modules](../../reference/modules.md). The reasoning behind the split is in [Split modules into core and extended tiers](../../decisions/0001-split-modules-into-core-and-extended-tiers.md).

## Infrastructure packages

Some packages under `packages/` are libraries rather than tiered modules. They aren't in the manifest and anyone may depend on them:

| Package                   | Purpose                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@monark/db`              | The Prisma schema (core models in `base.prisma`, plus each module's fragment) and the generated client.                                                                         |
| `@monark/common`          | The event bus, the event-type and search-source registries, errors, logger, tRPC helpers, pagination, encryption, guarded outbound HTTP, rate limiting, block-document helpers. |
| `@monark/query`           | The query language: filter tree, operators, text syntax, `@` variables.                                                                                                         |
| `@monark/components`      | Shared UI primitives.                                                                                                                                                           |
| `@monark/shared`          | Framework-free utilities.                                                                                                                                                       |
| `@monark/integration-kit` | Shared plumbing for integration modules: inbound webhook verification, connection routers, a REST client.                                                                       |
| `@monark/test-utils`      | The integration-test harness, which boots PostgreSQL in a container and applies migrations.                                                                                     |

`@monark/branding` is in the manifest as a core module but holds only configuration, so it has no router or events.

## Repository layout

```
services/
  api/                 Express + tRPC host; registers modules, mounts routes, runs workers
  web/                 Next.js App Router frontend
packages/
  <module>/            one package per feature module (src/server, src/client, src/contracts,
                       optional prisma/<module>.prisma fragment, README.md)
  db/ common/ query/   infrastructure packages
  …
tools/                 code generators (gen-*.ts) and repository checks (check-*.ts)
modules.manifest.ts    the tier registry
```

`services/web` and `services/api` hold no business logic. They compose module exports into a running app.

## Where a module keeps its data

A module has three places to store data, from cheapest to most capable:

1. The metadata sidecar: `UserMetadata` and `OrganizationMetadata` hold a JSON value per `(parent, module, key)`. No migration needed. Good for per-user or per-organization settings that are never filtered or sorted on.
2. Its own schema fragment: `packages/<module>/prisma/<module>.prisma` holds the module's tables under a `// ── MODULE: <name> ──` banner, and the module owns the migration. Needed for indexed columns, relations or foreign keys. Extended modules (Calendar, Kanban, Wiki, Achievements) and some core ones (API keys, Chat) use this.
3. The core base schema: `base.prisma` belongs to `@monark/db` and holds core models only. Extended modules never edit it.

Core models that point at a fragment's tables (back-relations) still live in `base.prisma`. See [Give each module its own schema fragment](../../decisions/0005-give-each-module-its-own-schema-fragment.md).

## Related

- [Module boundaries](boundaries.md)
- [Modules](../../reference/modules.md)
- [Extend Monark](../../build/extend/_index.md)
