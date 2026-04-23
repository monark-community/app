# Phase 0 — Implementation order

## Goal

Stand up the monorepo shell so every later phase drops into a pre-shaped slot. Zero features shipped; everything installed, typed, linted, and building. If Phase 0 is done well, Phase 1's first PR touches only the feature module it's implementing, never the surrounding scaffolding.

## Order

1. **Scaffold workspace root.**
   `app/pnpm-workspace.yaml`, base `package.json`, `tsconfig.base.json`, `.editorconfig`, `.eslintrc`, `.prettierrc`, `.gitignore`, and `app/turbo.json` with the task pipeline. See [`project-scaffolding.md`](project-scaffolding.md) for the exact layout.

2. **Create infrastructure packages.**
   - `packages/db` — Prisma init + first migration, generated client exported.
   - `packages/common` — event bus runtime + shared errors + `Result` type. Hand-written `contracts/events.ts` with `DomainEventBase` + re-export stub for the generated union.
   - `packages/shared` — portable utils with no framework deps.
   - `packages/components` — shadcn via `@monark/ui`, re-exported for service consumption.

3. **Wire dependency enforcement.**
   - ESLint boundary rule: `services/web/**` cannot import `@monark/*/server`; `services/api/**` cannot import `@monark/*/client`.
   - `app/modules.manifest.ts` with empty `MODULES = {}` ready for Phase 1.
   - `pnpm check:tiers` script that walks the manifest and enforces the core/extended rule.

4. **Build the codegen + scaffolding tools** in `app/tools/`:
   - `gen-module.ts` (`pnpm gen:module <name> --tier core|extended`) — scaffolds a new package end-to-end per [`project-scaffolding.md`](project-scaffolding.md)'s "Developer tooling" section.
   - `gen-events.ts` (`pnpm gen:events` / `--check`) — writes `packages/common/src/contracts/events.generated.ts` per [`modular-architecture.md`](modular-architecture.md)'s "The event bus" section.
   - `gen-routers.ts` (`pnpm gen:routers` / `--check`) — writes `services/api/src/trpc/app-router.generated.ts`.
   - Root `package.json` wiring: `gen`, `gen:module`, `gen:events`, `gen:routers`, `prebuild` hook.

5. **Create services.**
   - `services/web` — Next 16 App Router, empty root route, Supabase SSR helper stub.
   - `services/api` — Express 5 + tRPC v11, `/health` route, CORS for the web origin. `src/trpc/router.ts` is a one-liner re-export of the generated app router (empty in Phase 0 because no modules are registered yet).

6. **Prove the full stack end-to-end.**
   Run `pnpm gen:module auth --tier core` to create the first module with a dummy procedure + dummy event. Wire it through api + web. Confirm: dummy procedure callable from web; dummy event emits and persists; `gen:events --check` and `gen:routers --check` pass. If this step works, every later module is a one-command scaffold.

7. **CI pipeline.**
   Install → `gen:events --check` + `gen:routers --check` → lint → typecheck → `check:tiers` → test → build → e2e. Fail-fast on any step.

## Exit criteria

- `pnpm install && pnpm build` succeeds in a fresh clone.
- `pnpm dev` launches web on :3000 and api on :4000 simultaneously; web can hit api's `/health`.
- `pnpm gen:module <name>` produces a compiling package registered in the manifest with zero manual edits.
- ESLint boundary violation (e.g. a deliberate `services/web` → `@monark/auth/server` import) fails CI.
- Codegen drift (editing a module's events without rerunning `gen:events`) fails CI.
- One real module (`@monark/auth`) exists as proof; all other modules defer to their phase.

## Parallelization

Step 2 can begin in parallel with step 3 once step 1 lands. Step 4 (tools) depends on step 3's manifest being in place. Steps 5 and 6 serialize because the services are thin and only meaningful once a module exists to wire through them. Step 7 (CI) can be sketched in parallel with 4–6 and hardened at the end.

## What Phase 0 deliberately does not do

- No auth, no user schema, no sessions (beyond the dummy procedure proving the stack).
- No feature flags beyond a stub; the real flag service lands as the first Phase 1 module.
- No Turborepo remote cache (local caching only at Phase 0; remote wires in after stabilization).
- No additional modules beyond the proof-of-concept `@monark/auth` scaffold; every real module ships in its assigned phase.
