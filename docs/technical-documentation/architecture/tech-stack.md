# Tech stack

| Layer    | Technology                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind v4, shadcn (@monark registry)                                                                                 |
| Backend  | Express 5, tRPC v11, pino logger                                                                                                                          |
| Database | PostgreSQL via Supabase, Prisma ORM                                                                                                                       |
| Auth     | Supabase Auth + custom TOTP / trusted-device logic                                                                                                        |
| Testing  | Vitest (unit/integration + testcontainers), Playwright (e2e)                                                                                              |
| CI       | GitHub Actions on `main` + `develop` ; lint/typecheck, repo-checks, migration-drift, unit + integration, coverage floors ; e2e manual. See [ci.md](../ci/_index.md) |
| Monorepo | pnpm workspaces, Turborepo                                                                                                                                |
| Deploy   | api + crons on Render ([render.yaml](../../../render.yaml)) ; web on Vercel. See [deploy-checklist.md](../deploy-checklist/_index.md)                                  |
