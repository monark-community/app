# What core does NOT guarantee

These are the boundaries an extended module must not cross. Crossing them means the module is doing something that should ship as a core change instead.

- **Extended modules MUST NOT reshape core or other modules' tables.** A module that needs relational / indexed / FK-bearing storage adds **its own** models in a per-module fragment [`packages/<module>/prisma/<module>.prisma`](../../../packages/calendar/prisma/calendar.prisma) under its `// ── MODULE: <name> ──` banner (as `@monark/calendar` and `@monark/kanban` do) ; `pnpm gen:schema` assembles every fragment into the generated `schema.prisma`, and the module owns its migration. It must never edit [`base.prisma`](../../../packages/db/prisma/base.prisma) or the generated `schema.prisma` directly, nor rename / restructure / repurpose any model outside its own banner ; schema changes go through `@monark/db` review. For per-user / per-org data that needs no indexing, relations, or FKs, use the metadata sidecar (option 4 above) instead of a table.
- **Extended modules MUST NOT depend on another extended module.** Use core packages, the event bus, or the metadata sidecar to compose features.
- **Extended modules MUST NOT mutate core registries directly** ; only call the `register*` APIs. Reaching into `@monark/feature-flags/contracts` to mutate the in-memory map directly would crash boot ordering and bypass validation.
- **Extended modules MUST NOT rename or repurpose core domain events.** Add new event types under your module's prefix ; never reshape `auth.password-changed` for a different meaning.
- **Extended modules MUST NOT register flags / permissions / kinds under a core module's namespace.** Use your own module name as the namespace ; collisions are a deploy-time error.
