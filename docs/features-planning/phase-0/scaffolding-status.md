# Phase 0: Scaffolding Status

Phase 0 is complete at the file level. The monorepo is typed, lintable, and ready for `pnpm install`.

See [project-scaffolding.md](./project-scaffolding.md) for the plan this scaffolding implements.

## What landed

- Workspace root: [pnpm-workspace.yaml](../../../pnpm-workspace.yaml), [package.json](../../../package.json), [tsconfig.base.json](../../../tsconfig.base.json), [turbo.json](../../../turbo.json), [eslint.config.mjs](../../../eslint.config.mjs), [.prettierrc.json](../../../.prettierrc.json), [.editorconfig](../../../.editorconfig), [.nvmrc](../../../.nvmrc).
- Infrastructure packages: [packages/db](../../../packages/db/) (Prisma), [packages/common](../../../packages/common/) (event bus, errors, tRPC primitives, pino logger, Result), [packages/shared](../../../packages/shared/) (portable utils placeholder), [packages/components](../../../packages/components/) (shadcn-compatible entry via `@monark/ui` registry).
- Services: [services/api](../../../services/api/) (Express 5 + tRPC v11 + pino + cors + zod env validation), [services/web](../../../services/web/) (Next App Router + Tailwind v4 + tRPC React Query client).
- Module manifest + tier enforcement: [modules.manifest.ts](../../../modules.manifest.ts), [tools/check-tiers.ts](../../../tools/check-tiers.ts).
- Codegen tools: [tools/gen-module.ts](../../../tools/gen-module.ts), [tools/gen-events.ts](../../../tools/gen-events.ts), [tools/gen-routers.ts](../../../tools/gen-routers.ts), naming helpers in [tools/lib/names.ts](../../../tools/lib/names.ts).
- CI workflow: [.github/workflows/ci.yml](../../../.github/workflows/ci.yml).

## First-run instructions

```bash
# From app/
pnpm install              # installs workspace deps; runs prisma generate in @monark/db
pnpm gen                  # regenerates events.generated.ts and app-router.generated.ts (no-op until modules exist)
pnpm typecheck            # tsc --noEmit across the workspace (via turbo)
pnpm lint                 # eslint across the workspace (via turbo)
pnpm check:tiers          # passes trivially with zero modules
```

## Proving the stack end-to-end (Phase 0 exit criterion)

Scaffold the first module using the generator, then verify the codegen picks it up:

```bash
pnpm gen:module auth --tier core
pnpm install              # picks up the new workspace package
pnpm gen                  # regenerates events.generated.ts + app-router.generated.ts
pnpm typecheck            # should pass: api now has authRouter composed in
pnpm gen:events --check   # should pass (no drift)
pnpm gen:routers --check  # should pass
```

Expected result: `packages/auth/` exists with `src/{server,client,contracts}/`, the manifest has `@monark/auth` under `core`, and the generated app-router file names `authRouter` on an `auth` key.

## Extension points for non-core modules

The platform exposes five extension points that let extended modules add their own flags, permissions, notification kinds, per-user / per-org metadata, and event subscribers without modifying core code. The full contract is in [docs/technical-documentation/extensibility-contract.md](../../technical-documentation/extensibility-contract/_index.md) ; the short version :

- **Feature flags** : `registerFlags("<module>", { ... })` from `@monark/feature-flags/server`.
- **Permissions** : `registerPermissions("<module>", { ... })` from `@monark/rbac/server`.
- **Notification kinds** : `registerNotificationKind(kind, def, messages)` from `@monark/notifications/server` + a `declare module` augmentation of `NotificationDataRegistry` for typed payloads.
- **Per-user / per-org metadata** : the `users.metadata.*` / `organizations.metadata.*` tRPC procedures, gated by per-module read / write permissions the extended module registers itself.
- **Domain events + webhooks** : export `XxxEvents` from your module's `/contracts/events.ts` and add the package to `modules.manifest.ts` ; the type union regenerates on `pnpm gen:events`, and the webhook subscriber routes any matching `WebhookSubscription` automatically.

Boot wiring lives in [services/api/src/server.ts](../../../services/api/src/server.ts) : every module's `register*` helpers are called once before `syncFlagsToDatabase()` + the worker starts.

## Known follow-ups (not blocking Phase 0)

- **Production build story for the api.** Every package exports TypeScript source (via tsconfig `paths` + package.json exports pointing at `src/**/*.ts`), which makes dev + typecheck straightforward but blocks a plain `tsc` production build (cross-package imports trip `rootDir`). Phase 0 sidesteps this by running `pnpm --filter api start` through tsx. Phase 1 will add a bundler (esbuild or tsup) that traces all workspace imports and emits a single production artifact.
- **Next version pin.** `next: ^15.5.0` is used because Next 16's install story was uncertain at scaffold time. Bump to `^16` once you've verified the install on CI.
- **Supabase helpers.** `services/web/src/lib/supabase/` and JWT verification middleware in `services/api/src/trpc/` are stubs; they land with the first auth module in Phase 1.
- **Turbo remote cache.** Local cache only today; remote cache wires in after Phase 0 stabilizes.

## Directory map

```
app/
├─ services/
│  ├─ api/            Express 5 + tRPC v11 host
│  └─ web/            Next App Router + Tailwind v4
├─ packages/
│  ├─ db/             Prisma schema + generated client
│  ├─ common/         event bus, errors, logger, tRPC primitives, Result
│  ├─ shared/         portable utilities
│  └─ components/     app-specific UI compositions (shadcn via @monark/ui)
├─ tools/
│  ├─ check-tiers.ts  extended-extended dep guard
│  ├─ gen-module.ts   scaffold a new module package
│  ├─ gen-events.ts   regenerate the DomainEvent union
│  ├─ gen-routers.ts  regenerate the app router composition
│  └─ lib/names.ts    naming helpers shared by the tools
├─ modules.manifest.ts   single source of truth for the module graph (eight core modules : auth, branding, feature-flags, notifications, organizations, rbac, users, webhooks)
├─ turbo.json
├─ tsconfig.base.json
├─ eslint.config.mjs
├─ pnpm-workspace.yaml
└─ package.json
```
