# Infrastructure packages

Support libraries under `packages/` that aren't tier-registered feature modules :

| Package              | Purpose                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@monark/db`         | Prisma schema (assembled `base.prisma` + per-module fragments) + generated client.                                    |
| `@monark/common`     | Event bus runtime, errors, `Result`, pino logger, tRPC primitives, SSRF-safe fetch, rate-limit, crypto. Backend-only. |
| `@monark/query`      | MonarkQL : the shared filter-tree AST, operator taxonomy, text DSL, and `@variables`.                                 |
| `@monark/shared`     | Portable utilities with no framework dependencies.                                                                    |
| `@monark/components` | App-specific UI primitives. Consumes shadcn components via the `@monark` registry.                                    |
| `@monark/branding`   | Brand config (logo path, app name, colours). Used by services and email templates.                                    |
| `@monark/test-utils` | Integration-test harness (boots a Postgres testcontainer + migrations).                                               |
