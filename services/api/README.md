# services/api

Express 5 + tRPC v11 host. Composes every `@monark/<module>/server` sub-router into a single `appRouter` and mounts it at `/trpc`. Also exposes `/health`.

The router composition is generated; see [`src/trpc/app-router.generated.ts`](src/trpc/app-router.generated.ts) and the root `pnpm gen:routers` script.

## Scripts

```bash
pnpm --filter api dev         # tsx watch src/server.ts on :4000
pnpm --filter api build       # tsc -p tsconfig.json
pnpm --filter api typecheck   # tsc --noEmit
pnpm --filter api lint        # eslint src
pnpm --filter api test        # vitest
```

## Environment

Copy `.env.example` to `.env` before running. See the root [README](../../README.md) for the full stack and dev-ergonomics story.
