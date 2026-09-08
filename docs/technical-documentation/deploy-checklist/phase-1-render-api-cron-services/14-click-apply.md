# 1.4 Click "Apply"

Render runs the build (`pnpm install` + `prisma generate`), the `preDeployCommand` (`prisma migrate deploy` against Supabase Postgres), then starts the api. Watch the logs in the dashboard.

Expected milestones in the api log :

- `webhook delivery worker started`
- `Single-tenant bootstrap : evaluating boot-time hook`
- `api listening on port 4000` (or similar)

The `/health` endpoint should respond 200 ; Render's health check runs every 60 s.

If `prisma migrate deploy` fails, the deploy aborts cleanly ; fix the schema / DB credentials and push again.

The singleton org is provisioned at api boot from `INITIAL_ORG_*` (idempotent : a restart on a healthy install is a no-op). To (re)provision without a restart ; e.g. from a Render Shell with `DATABASE_URL` set : run `pnpm provision:org` (reads the same `INITIAL_ORG_*` env, or takes `--slug` / `--name` / `--color` flags).
