# 2.4 Codegen

`pnpm gen` = `gen:schema` (assembles `packages/db/prisma/schema.prisma` from `base.prisma` + per-extended-module fragments) + `gen:events` (builds the `DomainEvent` union from each module's `contracts/events.ts`) + `gen:routers` (composes the tRPC app router). Generated files are never hand-edited ; CI fails on drift. Additional gates: `pnpm check:tiers`, `pnpm check:modules`, `pnpm check:i18n`.
