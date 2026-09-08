# Phase-2 follow-ups

- ~~**Per-module schema fragments.**~~ **Shipped.** `pnpm gen:schema` concatenates each module's `prisma/<module>.prisma` fragment into the root schema before generation, so a module ships indexed columns + FK relations without touching core (`calendar`, `kanban`, and core `api-keys` own fragments today).
- **Codegen for boot wiring.** A `pnpm gen:boot` script that scans the manifest and emits a `services/api/src/boot-registrations.generated.ts` file with every module's `register*()` calls. Removes the hand-maintained list in `services/api/src/server.ts`.
- **Persisted event bus.** The in-memory bus loses events on a process crash _between_ `emit()` and the wildcard subscriber's outbox write. Today the window is the same Prisma transaction so the source-mutation rollback covers it ; if subscribers ever go async-after-commit we'd want a real outbox at the bus level.
- **Receiver-side webhook verifier package.** A tiny `@monark/webhooks/verifier` that wraps the HMAC compare + timestamp tolerance for hand-rolled receivers.
