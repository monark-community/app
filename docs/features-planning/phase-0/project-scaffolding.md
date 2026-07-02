# Project Scaffolding

## Context

Before any feature lands, the monorepo needs a concrete stack, workspace wiring, per-service build setups, a cross-service API contract, and a dev-ergonomics story that makes "run everything" a one-liner.

The architecture decision that shapes everything else: each **business module** (auth, rbac, voting, …) is its own **workspace package**. Two thin runnable services (`services/web` for the Next.js 16 frontend, `services/api` for the Express 5 backend) consume those packages. This trades a handful of extra workspace members for physically-enforced module boundaries — you can't accidentally import a module's internals because they aren't exported from its `package.json`.

## Goals

- pnpm workspace rooted at `app/`, with member packages under `app/services/*` and `app/packages/*`.
- `services/web` — Next.js 16 App Router; thin. Routes compose components exported from module packages.
- `services/api` — Express 5 + tRPC; thin. Router composes sub-routers exported from module packages.
- `packages/db` — Prisma schema + generated client. The one place the schema lives.
- `packages/common` — runtime helpers + event bus (in-process).
- `packages/shared` — portable code that could ship outside the monorepo.
- `packages/components` — app-specific UI compositions on top of `@monark/ui`.
- **One package per business module** (`@monark/auth`, `@monark/rbac`, `@monark/voting`, …). Each exports three subpaths: `/server`, `/client`, `/contracts`.
- Dev ergonomics: one `pnpm dev` that boots web + api concurrently; per-service filters for focused iteration.
- CI runs lint, typecheck, tests across the whole workspace on every PR.

## Non-goals

- No third runnable service at Phase 0 (workers, cron runners, admin CLI). If one is needed later, it's a new `services/*` member and changes nothing about the package tier.
- Not carving existing Monark monorepo conventions into this app; we picked simplicity over convention. `packages/components`, `packages/common`, `packages/shared` keep their roles; every business module becomes its own sibling package.
- Not polyrepo. The `monark/ui` registry lives in its own repo (sister directory); consumed as a published npm package.
- Not building a bespoke CI runner or deploy orchestration at Phase 0.

## Stack

| Concern               | Choice                                                     | Where it lives                                                                                         |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Package manager       | pnpm ≥ 10, workspaces                                      | `app/` root                                                                                            |
| Node runtime          | Node 22 LTS (pinned via `.nvmrc` + `packageManager` field) | root                                                                                                   |
| Monorepo orchestrator | Turborepo (caching + graph-aware filters) on top of pnpm   | `app/turbo.json`                                                                                       |
| Backend framework     | Express 5                                                  | `services/api`                                                                                         |
| Frontend framework    | Next 16 (App Router)                                       | `services/web`                                                                                         |
| Language              | TypeScript strict across the board                         | every package                                                                                          |
| Cross-service RPC     | tRPC v11                                                   | sub-routers in each module's `/server`, composed in `services/api`; type-only import in `services/web` |
| DB                    | Supabase Postgres                                          | accessed through `@monark/db` only                                                                     |
| ORM                   | Prisma                                                     | schema + generated client in `packages/db`                                                             |
| Auth                  | Supabase Auth (web session) + JWT verification (api)       | web: `@supabase/ssr`; api: `jose` + Supabase JWKS                                                      |
| UI base               | `@monark/ui` (shadcn-compatible registry, published)       | installed into `packages/components` via shadcn CLI                                                    |
| Styling               | Tailwind v4                                                | `services/web` + `packages/components` + per-module `/client` bundles                                  |
| Form + validation     | React Hook Form + Zod (shared schemas from `/contracts`)   | any `/client`                                                                                          |
| Testing (unit)        | Vitest                                                     | per package                                                                                            |
| Testing (e2e)         | Playwright                                                 | `services/web/tests/e2e` against running web + api                                                     |
| Linting               | ESLint + `eslint-plugin-boundaries`                        | root config, plus per-module workspace-dep rules                                                       |

## Workspace topology

```
app/
  package.json                            # root; private: true
  pnpm-workspace.yaml                     # packages: ["services/*", "packages/*"]
  tsconfig.base.json                      # strict settings inherited everywhere
  eslint.config.mjs
  .nvmrc                                  # 22
  .gitignore

  services/
    web/                                  # Next.js 16 frontend — thin
      package.json                        # deps: every @monark/<module>, @monark/components
      next.config.ts                      # transpilePackages: ["@monark/*"]
      tsconfig.json                       # extends ../../tsconfig.base.json
      .env.example
      src/
        app/                              # App Router. Pages are ≤ 10-line wrappers over page components from modules.
          (marketing)/
          (app)/
            [org]/...
          api/                            # web-origin-only handlers: OAuth callbacks, web webhooks
          layout.tsx
        lib/
          trpc.ts                         # tRPC client bound to AppRouter type from services/api
          supabase/                       # @supabase/ssr wrappers
          env.ts
        components/                       # web-only chrome (app shell, page layouts)
      tests/
        e2e/

    api/                                  # Express 5 backend — thin
      package.json                        # deps: every @monark/<module>, @monark/db, @monark/common
      tsconfig.json
      .env.example
      src/
        server.ts                         # boot: express, middleware, tRPC handler, health
        trpc/
          router.ts                       # composes each @monark/<module>/server router into `appRouter`
          context.ts                      # per-request context: db, authenticated user, req/res
          auth.ts                         # JWT verification middleware
        lib/
          env.ts
          webhooks/                       # external webhook handlers (referral, payout, GitHub)
      tests/
        unit/

  packages/
    # ── Infrastructure packages ──────────────────────────────────────

    db/                                   # Prisma schema + generated client
      package.json                        # name: @monark/db
      prisma/
        schema.prisma                     # the one schema; modules own sections via // ── MODULE: auth ── comments
        migrations/
      src/
        index.ts                          # re-exports the generated @prisma/client
        seed.ts                           # dev seed data
      tsconfig.json

    common/                               # app-internal runtime helpers
      package.json                        # name: @monark/common
      src/
        index.ts                          # barrel: errors, log, result
        events.ts                         # in-process event bus runtime (singleton)
        contracts/
          events.ts                       # domain event TYPE definitions (shared with every module)
        errors.ts                         # project error classes
        log.ts                            # pino wrapper
        result.ts                         # Result<T, E>
      tsconfig.json

    shared/                               # portable; publishable outside the repo
      package.json                        # name: @monark/shared
      src/
        contracts/                        # cross-project Zod schemas (external referral, etc.)
        types/
        utils/
      tsconfig.json

    components/                           # app-specific UI compositions
      package.json                        # name: @monark/components
      src/
        ui/                               # shadcn installs via @monark/ui registry (generated)
        compositions/                     # app-specific multi-component compositions (AdminLayout, OrgSwitcher, etc.)
      components.json                     # shadcn config pointing at https://ui.monark.io
      tsconfig.json

    # ── Business module packages (one per module) ───────────────────
    # Each has identical shape; shown once below.

    auth/
      package.json                        # name: @monark/auth; exports "./server", "./client", "./contracts"
      src/
        server/
          index.ts                        # public: tRPC sub-router, read-interface fns
          procedures/                     # tRPC procedure bodies
          domain/                         # pure business logic
          data/                           # Prisma queries (imports from @monark/db)
          events/                         # publishers + subscribers
        client/
          index.ts                        # public: React components, hooks, page composers
          ui/
          hooks/
          pages/
        contracts/
          index.ts                        # Zod schemas + event types (shared server+client)
      tsconfig.json
      tests/

    organizations/                        # same shape as auth/
    users/                                # same shape
    rbac/                                 # same shape
    feature-flags/                        # same shape
    onboarding/                           # phase 2
    referral/                             # phase 2
    voting/                               # phase 3
    contributions/                        # phase 3
```

## Package responsibilities (and what does NOT go where)

### `services/web`

Thin. Owns the browser experience: app shell, route composition, Supabase session. Routes under `src/app/` are typically ≤ 10 lines each, importing a page component from the relevant module's `/client`. Never talks to Prisma or Supabase DB directly. Only imports the `AppRouter` **type** from `services/api` (for tRPC client typing).

### `services/api`

Thin. Owns process lifecycle: Express boot, middleware, tRPC handler mount, health endpoint, external webhook routes. The business logic lives in module packages; `services/api/src/trpc/router.ts` composes their sub-routers.

### `packages/db` (`@monark/db`)

Owns `prisma/schema.prisma` and the generated client. Every module's `/server/data/` imports from `@monark/db`. Migrations run from here. Seed script here.

### `packages/common` (`@monark/common`)

Owns the in-process event bus (runtime + singleton) and shared helpers (errors, log, result types). The event bus runtime lives here so every module's `/server` imports the same instance. Event _type definitions_ also live here so any `/server` or `/client` can import them without pulling cross-module code.

### `packages/shared` (`@monark/shared`)

Portable code we would extract outside the monorepo. API client abstractions, generic utility types, cross-project conventions. Private for now.

### `packages/components` (`@monark/components`)

App-specific UI compositions. Installs shadcn components from `@monark/ui`'s registry. Hosts app chrome pieces (e.g., `<AdminLayout>`). Individual business components (e.g., `<VoteBallot>`) live in their own module's `/client`, not here.

### `packages/<module>` (e.g. `@monark/auth`)

Owns everything about one business module: server-side tRPC sub-router, client-side UI, shared contracts. Three entry points via `package.json#exports`:

```json
{
  "name": "@monark/auth",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./server": "./src/server/index.ts",
    "./client": "./src/client/index.ts",
    "./contracts": "./src/contracts/index.ts"
  },
  "dependencies": {
    "@monark/db": "workspace:*",
    "@monark/common": "workspace:*"
  }
}
```

The three exports + nothing else mean: if another package imports `@monark/auth/domain/password-rules`, TypeScript can't resolve it. Zero runtime escape hatches.

## Dependency rules (enforced by package.json, not lint)

- **`services/web`** depends on every `@monark/<module>` and imports from `./client` or `./contracts`. Never from `./server`.
- **`services/api`** depends on every `@monark/<module>`, `@monark/db`, `@monark/common`. Imports from `./server` or `./contracts`. Never from `./client`.
- **Core module packages** (`@monark/auth`, `@monark/organizations`, `@monark/users`, `@monark/rbac`, `@monark/feature-flags`) depend on each other freely. Declared via `workspace:*` in `package.json#dependencies`.
- **Extended module packages** (`@monark/onboarding`, `@monark/referral`, `@monark/voting`, `@monark/contributions`) depend on **core modules only**. Never on each other. If two extended modules genuinely need to share state, the shared concept gets promoted to a core package; otherwise they communicate through the event bus.
- **`@monark/components`** and `@monark/shared` depend on nothing from the business-module tier; business modules may depend on them.

The ESLint-boundaries rule does one job: forbid `services/web` from importing `@monark/*/server` and forbid `services/api` from importing `@monark/*/client`. The rest is enforced by package.json depgraph — if you haven't declared the workspace dep, the import fails to resolve.

## Module manifest

```ts
// app/modules.manifest.ts
export const MODULES = {
  // core tier — coupled, ship together
  "@monark/auth": { tier: "core" },
  "@monark/organizations": { tier: "core" },
  "@monark/users": { tier: "core" },
  "@monark/rbac": { tier: "core" },
  "@monark/feature-flags": { tier: "core" },

  // extended tier — independent, may not depend on each other
  "@monark/onboarding": { tier: "extended" },
  "@monark/referral": { tier: "extended" },
  "@monark/voting": { tier: "extended" },
  "@monark/contributions": { tier: "extended" },
} as const;
```

A CI guard (`pnpm check:tiers`) walks each extended package's `package.json#dependencies` and fails if any of them names another extended package. Minimal code; catches the only boundary violation package.json can't catch on its own (since workspace deps compile fine).

## The cross-service API

- Each module's `/server/index.ts` exports a tRPC sub-router:
  ```ts
  export const authRouter = t.router({ signIn, signUp, signOut, ... })
  ```
- `services/api/src/trpc/router.ts` composes them:
  ```ts
  export const appRouter = t.router({
    auth: authRouter,
    organizations: orgsRouter,
    users: usersRouter,
    rbac: rbacRouter,
    voting: votingRouter,
    // ...
  });
  export type AppRouter = typeof appRouter;
  ```
- `services/web/src/lib/trpc.ts` imports `type { AppRouter }` from `services/api` via workspace path alias. No runtime code crosses the boundary.
- Auth: web holds the Supabase session cookie via `@supabase/ssr`; every tRPC call forwards `Authorization: Bearer <jwt>`; api verifies against Supabase JWKS and populates the tRPC context.

## Environment

Each service owns its `.env.example` and real env file. Module packages have no env of their own — they receive config through their `/server` factory functions called by `services/api` at boot.

**`services/web/.env.example`**:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**`services/api/.env.example`**:

```
PORT=4000
DATABASE_URL=postgresql://...            # Supabase pooled connection
DIRECT_URL=postgresql://...              # direct connection for migrations
SUPABASE_URL=...
SUPABASE_JWKS_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
TOTP_ISSUER=Monark
SESSION_SECRET=...
EXTERNAL_REFERRAL_WEBHOOK_SECRET=...
```

Both services validate env at boot via Zod and fail loudly on missing/invalid. No raw `process.env` elsewhere.

## Build + consumption

**In dev**, services consume module packages as TypeScript source:

- `services/api` runs via `tsx watch src/server.ts`. TS source from every `@monark/*` package is transpiled on demand. No pre-build step.
- `services/web` sets `transpilePackages: ["@monark/*"]` in `next.config.ts`. Next's build pipeline handles the TSX.

**In prod (api)**, we compile: `pnpm --filter api build` runs `tsc` against `services/api` and, because of project references in `tsconfig.base.json`, every `@monark/*` package it depends on. Output goes to each package's `dist/`. `services/api/dist/server.js` is the entrypoint.

**In prod (web)**, Next's standard build handles everything; no per-package pre-build needed.

No prebuilt `dist/` checked in. Dev workflow stays source-level for fast iteration.

## Dev ergonomics

### Root-level commands (run from `app/`)

```bash
pnpm install                # installs across the workspace
pnpm dev                    # turbo-orchestrated: web :3000, api :4000, supabase local :54321
pnpm build                  # topological build via turbo; cache-aware
pnpm lint                   # eslint across every package (turbo-cached)
pnpm typecheck              # tsc --noEmit across every package (turbo-cached)
pnpm test                   # vitest across every package (turbo-cached)
pnpm test:e2e               # playwright against running web + api
pnpm db:migrate             # prisma migrate deploy (delegates to @monark/db)
pnpm db:reset               # drop + reseed
pnpm check:tiers            # extended-extended dep sanity check
pnpm gen                    # run all codegen (events + routers)
pnpm gen:module <name>      # scaffold a new module package; --tier core|extended
pnpm gen:events             # regenerate packages/common/src/contracts/events.generated.ts
pnpm gen:routers            # regenerate services/api/src/trpc/app-router.generated.ts
pnpm dev:tools              # list local dev tools (mail, supabase, db studio, ...)
pnpm dev:tools <name>       # open one (mail | supabase | api | db | web | api-server | all)
```

### LAN-from-phone testing

`pnpm dev` works as-is when accessed from any device on your local network ; no env edits required for the app itself.

1. Find your dev machine's LAN IP (e.g. `10.0.0.42`, `192.168.1.50`).
2. **Run the LAN setup script** (Windows) — opens firewall + sets up the Supabase portproxy in one shot. From an elevated PowerShell:
   ```powershell
   .\tools\dev-lan-setup.ps1
   ```
   Idempotent ; re-run after reboots or `pnpm supabase stop && start`. To tear down : `.\tools\dev-lan-setup.ps1 -Remove`. macOS / Linux : see "Re-binding Supabase to the LAN" below for the equivalent commands.
3. On your phone (same Wi-Fi), open `http://<your-LAN-IP>:3000`. **If anything misbehaves, open the dev overlay on the phone (Alt+D, or tap the wrench bottom-right) and expand the "Remote Dev Diagnostics" section** to see exactly which layer is unreachable, what the resolved URLs are, and whether the auth session is reaching the api. The panel includes a one-tap "Clear stale cookies + sign in" button when it detects an old `sb-*` cookie under a stale storage key (the most common "everything green but data won't load" failure mode).

What works out of the box:

- The browser-side tRPC + Supabase clients (and avatar / banner `<img>` src URLs) [auto-rewrite the hostname](../../services/web/src/lib/dev-host-rewrite.ts) when the configured URL points to loopback but the browser is on a non-loopback host. The phone hits your dev machine for everything, not its own loopback.
- Email-link redirects (signup confirm, password reset, resend) read the request Host header via [getRequestAppUrl](../../services/web/src/lib/request-app-url.ts) and forward it through the relevant tRPC mutations, so the link lands on whatever host the phone is on.
- The api's CORS check accepts any RFC 1918 / loopback origin in `NODE_ENV=development` (production stays strict). Rejected origins log a warn line so you can see why.
- Supabase's `additional_redirect_urls` allowlist in [supabase/config.toml](../../supabase/config.toml) covers every private IPv4 range on port 3000.
- The api server explicitly binds to `0.0.0.0` so it's reachable from the LAN without depending on Node's dual-stack defaults.
- Mailpit / Inbucket stays loopback-only ; view captured emails on the dev machine via `pnpm dev:tools mail`.

#### Re-binding Supabase to the LAN

Supabase CLI v1.x maps every container port to `127.0.0.1` by default — even with our URL rewrite, the phone can't reach Supabase Auth or Storage because Docker isn't listening on the LAN side. **Symptom**: sign-in works (server actions live on the dev PC), but `/account` shows empty fields + infinite spinners because every browser-side Supabase / api call falls into a hung connection.

Pick one workaround:

**Option A — `socat` reverse proxy (simplest, run while testing).** Forward the Supabase port from the LAN interface to loopback. Re-run after every reboot, no Supabase restart required:

```bash
# bash on macOS / Linux ; PowerShell-equivalent below.
socat TCP-LISTEN:54321,fork,bind=<your-LAN-IP> TCP:127.0.0.1:54321
```

```powershell
# Windows PowerShell with `nssm` or just `netsh portproxy` :
netsh interface portproxy add v4tov4 `
  listenaddress=<your-LAN-IP> listenport=54321 `
  connectaddress=127.0.0.1 connectport=54321
# Remove with : netsh interface portproxy delete v4tov4 listenaddress=<your-LAN-IP> listenport=54321
```

**Option B — Re-tag the Docker port binding.** More invasive but persists across `supabase start` calls until you stop the container :

```bash
docker stop supabase_kong_app
docker run --name supabase_kong_app_lan --network supabase_network_app \
  -p 0.0.0.0:54321:8000 -d supabase/kong:2.8.1
```

**Option C — newer Supabase CLI.** Recent CLI versions support `host = "0.0.0.0"` in the `[api]` block of `supabase/config.toml`. Check `supabase --version` ; if you're on something post-2.x, this is cleanest. Stick the directive in, restart with `pnpm supabase stop && pnpm supabase start`.

### Per-package commands

```bash
pnpm --filter web dev
pnpm --filter api dev
pnpm --filter @monark/auth test
pnpm --filter "@monark/*" test         # every module
pnpm --filter @monark/components build
```

### Turborepo

`app/turbo.json` declares the build graph so `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm lint` become cache-aware and parallelizable. Shape:

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint": {},
    "test": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true },
    "gen:events": {
      "inputs": ["../packages/*/src/contracts/events.ts", "../modules.manifest.ts"],
      "outputs": ["../packages/common/src/contracts/events.generated.ts"],
    },
    "gen:routers": {
      "inputs": ["../packages/*/src/server/index.ts", "../modules.manifest.ts"],
      "outputs": ["../services/api/src/trpc/app-router.generated.ts"],
    },
  },
}
```

Concrete wins with ~14 packages: incremental CI builds skip untouched packages, `turbo run test --filter=...[HEAD~1]` tests only what changed since the last commit, local iteration stops re-typechecking modules you haven't touched. Not bound to any architecture detail, portable to Scintillar verbatim.

## Developer tooling (codegen + scaffolding)

Three small scripts live under `app/tools/`. Each exists to kill a class of repetitive edits that would otherwise compound with every new module.

### 1. `pnpm gen:module <name> --tier core|extended`

Scaffolds a new module package end-to-end, so adding a module stays a one-command operation instead of 10 minutes of copy-paste-rename.

Produces:

- `packages/<name>/package.json` with the strict three-exports shape and `@monark/db` + `@monark/common` deps.
- `packages/<name>/tsconfig.json` extending the base.
- `packages/<name>/src/{server,client,contracts}/index.ts` stubs with correct re-export patterns.
- `packages/<name>/src/contracts/events.ts` exporting `<Module>Events = never` (satisfies the events codegen's contract).
- Entry in `app/modules.manifest.ts` with the declared tier.
- Empty `tests/` directory with one placeholder Vitest spec.

The generator is ~100 lines of TypeScript reading a single template directory. Adding a tenth module takes 30 seconds including the commit. Portable to Scintillar with a find-replace on `@monark/*`.

### 2. `pnpm gen:events`

Already specified in [`modular-architecture.md`](modular-architecture.md) under **The event bus**. Walks the module manifest, asserts each module exports `<Module>Events`, writes `packages/common/src/contracts/events.generated.ts`. Two modes: write (`prebuild` + local dev) and `--check` (CI drift detection).

### 3. `pnpm gen:routers`

Same pattern as `gen:events`, applied to tRPC. Without it, `services/api/src/trpc/router.ts` becomes a hand-maintained list of every module's sub-router. With it, that file becomes generated and the list is always correct.

Produces `services/api/src/trpc/app-router.generated.ts`:

```ts
// AUTO-GENERATED by `pnpm gen:routers`. Do not edit by hand.
import { authRouter } from "@monark/auth/server";
import { organizationsRouter } from "@monark/organizations/server";
import { usersRouter } from "@monark/users/server";
import { rbacRouter } from "@monark/rbac/server";
// ...

import { t } from "./trpc";

export const appRouter = t.router({
  auth: authRouter,
  organizations: organizationsRouter,
  users: usersRouter,
  rbac: rbacRouter,
  // ...
});

export type AppRouter = typeof appRouter;
```

Convention: each module's `/server/index.ts` must export a named router `<module>Router` (camelCased module name + `Router` suffix). The codegen enforces this and fails loudly with a helpful message if a module forgets it.

Hand-written `services/api/src/trpc/router.ts` becomes a one-liner: `export { appRouter, type AppRouter } from "./app-router.generated"`. Drift is caught in CI via `pnpm gen:routers --check`.

### Script wiring

Root `package.json` additions:

```json
{
  "scripts": {
    "gen:module": "tsx tools/gen-module.ts",
    "gen:events": "tsx tools/gen-events.ts",
    "gen:routers": "tsx tools/gen-routers.ts",
    "gen": "pnpm gen:events && pnpm gen:routers",
    "prebuild": "pnpm gen"
  }
}
```

CI gets one extra step between typecheck and test: `pnpm gen:events --check && pnpm gen:routers --check`.

### What stays hand-written

- The event bus runtime itself (`packages/common/src/events.ts`). Codegen writes types only.
- Module contents (procedures, handlers, UI). Scaffolder writes stubs; humans fill them in.
- Cross-service context and middleware in `services/api/src/trpc/{context,auth}.ts`. No codegen benefit.

## CI posture (day-1)

Single GitHub Actions workflow on every PR:

1. `pnpm install --frozen-lockfile`
2. `pnpm gen:events --check && pnpm gen:routers --check` (fails fast on codegen drift)
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm check:tiers`
6. `pnpm test`
7. Start Supabase Postgres in a service container:
   - `pnpm db:migrate`
   - `pnpm --filter web build`
   - Start api + web in background, run `pnpm test:e2e`

Turborepo's remote cache (Vercel or a self-hosted S3 bucket) pipes into this workflow once Phase 0 stabilizes so cold CI runs only pay for what changed.

## Bootstrap checklist (concrete Phase 0 deliverables)

1. Create `app/package.json` + `app/pnpm-workspace.yaml`; pin pnpm + Node.
2. `app/tsconfig.base.json` with strict settings and project-reference wiring.
3. Install Turborepo; add `app/turbo.json` with the task pipeline shown above.
4. Scaffold `packages/db`: empty Prisma schema, `prisma generate` produces a re-exportable client. Seed script placeholder.
5. Scaffold `packages/common`: event bus skeleton + one error class + pino wrapper. Hand-written `contracts/events.ts` with `DomainEventBase` + re-export of the generated union.
6. Scaffold `packages/shared`: seed with `Result<T,E>` type.
7. Scaffold `packages/components`: `npx shadcn init` against `@monark/ui`; install theme + 3 primitives (button, input, card).
8. Wire the module manifest (`app/modules.manifest.ts`), `check:tiers` script, and ESLint web→server + api→client forbids.
9. Write the codegen tools in `app/tools/`:
   - `gen-module.ts` (scaffold generator)
   - `gen-events.ts` (master union codegen + `--check` mode)
   - `gen-routers.ts` (app router codegen + `--check` mode)
     Add the wiring scripts to the root `package.json`.
10. Use `pnpm gen:module auth --tier core` to produce `packages/auth` with one dummy tRPC procedure and one dummy event. Proves the scaffolder works end-to-end.
11. Scaffold `services/api`: Express + tRPC handler that imports `appRouter` from the generated file. Health endpoint. JWT middleware.
12. Scaffold `services/web`: Next 16 App Router, `@supabase/ssr`, tRPC client, a placeholder page that calls the dummy procedure from step 10 end-to-end.
13. CI workflow green on empty repo, including the `gen:*--check` step.

Only step 10 is novel from the scaffolder's POV; once `@monark/auth` works end-to-end, every other module is a one-command `pnpm gen:module <name>` away. The remaining 8 modules (orgs, users, rbac, feature-flags, onboarding, referral, voting, contributions) add as Phase 1/2/3 demands.

## Risks

- **Package count sprawl.** At Phase 3 complete, ~14 workspace members. pnpm handles it fine; the cognitive cost is the per-feature "which package owns this?" question. The three-exports pattern makes the answer mechanical (server-side logic? → `/server`. Form component? → `/client`.).
- **Circular workspace deps.** Two core modules that need to read each other's state (e.g., auth reads user profile, users reads auth session). Mitigate by keeping read interfaces minimal and putting truly shared concepts in `packages/common`. If a cycle still appears, extract the shared bit to a third package.
- **Prisma schema as a shared file.** Every module's `data/` queries a schema that lives in `packages/db`. Discipline via section comments (`// ── MODULE: auth ──`) and a pre-commit check that blocks edits outside the current PR's module comment block without explicit opt-in.
- **Next transpilePackages performance.** Transpiling N workspace packages on every change is slower than transpiling a single app. Watchable with `next dev --turbo` if it becomes painful.
- **`@supabase/ssr` + Next 16 cookie handling.** Fussy; expect one firefighting round. Centralize in `services/web/src/lib/supabase/server.ts`.
- **`@monark/components` vs `@monark/ui`.** `@monark/ui` ships canonical components via shadcn; `@monark/components` hosts app compositions on top. When a component in `@monark/components` feels generic, promote it up to `@monark/ui` rather than letting it solidify.
- **In-process event bus scales to one api process.** The moment we run more than one api instance, in-process events stop crossing instances. Plan to upgrade to Postgres `LISTEN`/`NOTIFY` or Redis pub/sub when horizontal scale arrives.

## Out of scope

- Production hosting, DNS, secrets management (Vercel env vars, Doppler, etc.)
- Observability (Sentry, OpenTelemetry, structured logs beyond `pino`)
- Analytics
- Background jobs / cron infra (several feature docs reference crons; the scaffolding doesn't pick a runner yet — worker service vs node-cron in api vs Vercel Cron is a separate decision before Phase 2)
- Email sending infra (auth flows need it; provider + template location deferred)
- Prod migration automation (manual gate vs auto-on-deploy is a separate call)
- Turborepo **remote** cache (local caching ships day-1; remote cache wires in after Phase 0 stabilizes)
- Release automation (changesets, tagging). Private monorepo; no publish flow needed.
