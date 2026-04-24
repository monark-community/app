# services/web

Next.js App Router frontend. Thin: routes compose page components exported from each `@monark/<module>/client`. Never talks to Prisma or Supabase DB directly; everything flows through tRPC against `services/api`.

The `AppRouter` type is imported from `services/api` for end-to-end type inference.

## Scripts

```bash
pnpm --filter web dev         # next dev on :3000
pnpm --filter web build       # next build
pnpm --filter web typecheck   # tsc --noEmit
pnpm --filter web lint        # eslint src
pnpm --filter web test:e2e    # playwright
```

## Environment

Copy `.env.example` to `.env` before running. See the root [README](../../README.md) for the full stack and dev-ergonomics story.
