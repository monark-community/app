# Module-authoring guidelines

How to add a new module, for agents and humans. Read this before scaffolding a package. It's the task-shaped recipe ; the _why_ is in [architecture.md](../technical-documentation/architecture.md) and the full contract is in [extensibility-contract.md](../technical-documentation/extensibility-contract.md). `CLAUDE.md` is the authoritative working agreement — this page condenses it into a checklist.

## TL;DR

- **Scaffold with `pnpm gen:module <name> --tier core|extended`.** Don't hand-build the `/server` `/client` `/contracts` skeleton.
- **Pick the tier deliberately.** _Core_ = infrastructure loaded by every deploy (high bar). _Extended_ = a business feature ; it may depend on core but **never on another extended module**, and **never edits `base.prisma`**.
- **Consider all four integration systems** — RBAC, domain events, notifications, feature flags — and make each a conscious yes/no. Wire the `register*` helpers into `services/api/src/server.ts`.
- **`pnpm gen`** after touching `contracts/events.ts` or the tRPC router (regenerates the event union + app router — never hand-edit the generated files).
- **Ship a README, an integration suite, i18n (en + fr), and a CHANGELOG entry.** `pnpm check:modules` enforces the module is complete.

## 1. Scaffold + register

```sh
pnpm gen:module <name> --tier core|extended
pnpm install
pnpm gen
```

The generator lays down `packages/<name>` with the three subpath exports (`/server`, `/client`, `/contracts`), the right `package.json` / `tsconfig` / vitest config, and registers it in [`modules.manifest.ts`](../../modules.manifest.ts). Boundaries are enforced by `package.json#exports` — everything not exported through those three paths is internal and unreachable.

**Tier check** (`pnpm check:tiers`) fails if an extended module depends on another extended module, or edits core schema. If your feature needs another extended module's internals, that's a signal to promote the shared piece into a core package.

## 2. The four systems

For each, decide explicitly — "not at all" is a valid, conscious answer. Register once at boot and wire the helper into `services/api/src/server.ts` next to the existing `register*` calls (order: flags → permissions → event-types → notification-kinds → subscribers, with the webhook subscriber last).

| System            | How                                                                                                                                             | Notes                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **RBAC**          | `registerPermissions("<module>", { "<key>": { description, category } })` ; gate writes with `requirePermission(ctx, "<module>.<key>", orgId)`. | Never inline `role.key === "ADMIN"`. Built-in ADMIN/SYSADMIN short-circuit, so a new permission auto-grants to admins. |
| **Domain events** | Declare the event on `contracts/events.ts` ; `emit(...)` from the server ; `registerEventTypes("<module>", {...})` for the operator picker.     | `pnpm gen:events` folds it into the `DomainEvent` union. Webhooks pick it up with no extra code.                       |
| **Notifications** | Augment `NotificationDataRegistry` (declaration merging) ; `registerNotificationKind(kind, def, messages)` with **en + fr**.                    | Prefer an event-bus subscriber over inline `notify()`. Never notify the actor about their own action.                  |
| **Feature flags** | `registerFlags("<module>", { "<key>": { description, defaultOn } })` ; check with `isEnabled("<module>.<key>", { userId, organizationId })`.    | New behavior → `defaultOn: false`. Gate incremental/rollout-sensitive work.                                            |

Data that doesn't fit core : use the **metadata sidecar** for un-indexed per-user/per-org values ; own a **Prisma fragment** if you need real tables — see [schema-changes.md](schema-changes.md).

## 3. Schema (if the module owns tables)

- **Extended** module → add models to `packages/<name>/prisma/<name>.prisma` under a `// ── MODULE: <name> ──` banner ; own the migration.
- **Core** module → add to `base.prisma` (same banner).
- Then `pnpm gen` (assembles `schema.prisma`) and `pnpm --filter @monark/db db:migrate:dev`. Follow the full workflow — including the GIN-drift gotcha — in [schema-changes.md](schema-changes.md).

## 4. Frontend (if it has UI)

Wired pages live in `services/web/src/app/(authed)/<area>/` and import the module's `/client` + `/contracts`. Reuse the shared [`components/patterns`](../../services/web/src/components/patterns) (DataTable, FilterBar, TableDetailLayout, …) and the [`components/fields`](../../services/web/src/components/fields) toolkit. Add a primary-nav entry in `config/primary-nav.ts` (behind the module's flag) if it's a top-level destination. Every async surface ships a layout-accurate `Skeleton`, and every visible string goes through i18n (en + fr).

## 5. Docs + tests

- **README** — follow the shape the other packages use (What's here / Key concepts / Public API / Data model / Events / tRPC surface). For an **extended** module, keep the _user_ guide in `packages/<name>/docs/user-guide.md` and link it from the [user-guide index](../user-guide/_index.md) — see [user-doc.md](user-doc.md).
- **Tests** — at least one integration suite (required by `check:modules`) ; see [testing.md](testing.md). Add a `THRESHOLDS` entry in `tools/merge-coverage.ts` for the new package.
- **CHANGELOG** — one dated entry under `[Unreleased]`.

## Definition of done

- [ ] Listed in `modules.manifest.ts` with the right tier.
- [ ] RBAC / events / notifications / flags each addressed (or consciously N/A) ; `register*` wired into `services/api/src/server.ts`.
- [ ] Schema in a fragment (extended) or `base.prisma` (core) ; migration authored (GIN gotcha handled) ; no extended→extended dep.
- [ ] Codegen fresh (`pnpm gen`) ; no generated file hand-edited.
- [ ] Strict TS holds ; zod-validated inputs ; every async surface has a skeleton.
- [ ] README updated ; user guide added (extended → in-package) ; i18n en + fr ; CHANGELOG entry.
- [ ] Integration suite present ; coverage floor entry added.
- [ ] Pre-PR gate passes : `pnpm gen && pnpm typecheck && pnpm lint && pnpm test && pnpm check:tiers && pnpm check:modules && pnpm check:i18n && pnpm check:mcp`.
