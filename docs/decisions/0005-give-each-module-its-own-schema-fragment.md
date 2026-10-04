---
type: decision
status: accepted
date: 2026-07-28
---

# 0005. Give each module its own schema fragment

## Context

Prisma reads one schema file. Until mid-2026, extended modules such as Calendar and Kanban defined their tables inside that single core `schema.prisma`, under a banner comment. That quietly broke the rule that extended modules don't touch core schema: removing a module meant editing core, and every module with tables competed for the same file. The metadata sidecar covers small settings, but not data that needs indexes, relations or foreign keys.

## Options

| Option                                                          | For                                                                   | Against                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Keep one hand-edited schema, with banners per module            | No tooling; what Prisma expects                                       | Extended modules edit a core file; the boundary exists only as a comment                   |
| Prisma's multi-file schema support                              | Native                                                                | Expects the files in one folder, so tables would still live outside their module           |
| A fragment per module, assembled into the schema by a generator | Each module owns its tables and migration; removable with its package | Another generated artifact to keep in sync; core back-relations still point into fragments |

## Decision

Core models live in `packages/db/prisma/base.prisma`. A module that needs tables keeps them in `packages/<module>/prisma/<module>.prisma`. `pnpm gen:schema` assembles base and fragments into `schema.prisma`, which is committed and drift-checked in CI like the other generated files. `pnpm check:tiers` fails if an extended module's banner appears in `base.prisma`.

The deciding reason: it turns "extended modules don't own core schema" from a comment into a checked rule, while Prisma, installs and migrations keep reading one ordinary schema file.

## Consequences

- Extended modules (Calendar, Kanban, Wiki, Achievements) and some core ones (API keys, Chat) own their tables and migrations.
- Back-relations on core models that point at a fragment's tables still sit in `base.prisma`, so core and extended schema aren't fully decoupled yet.
- Editing `schema.prisma` directly is pointless: the next `pnpm gen` overwrites it and CI rejects the drift.
