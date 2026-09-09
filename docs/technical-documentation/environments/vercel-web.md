# Vercel (web)

Vercel maps branches to environments through the dashboard, not `vercel.json`:

1. **Project → Settings → Git → Production Branch = `main`.** Every push to
   `main` is a Production deploy; every other branch (including `develop`) is a
   **Preview** deploy automatically.
2. **Give `develop` a stable staging URL.** Vercel already assigns a durable
   per-branch alias (`<project>-git-develop-<team>.vercel.app`). For a nicer host,
   add a domain (e.g. `staging.yourdomain.com`) under **Settings → Domains** and
   assign it to the `develop` branch.
3. **Scope env vars by environment.** Under **Settings → Environment Variables**,
   set each `NEXT_PUBLIC_*` for **Production** (→ prod api / prod Supabase) and a
   separate value for **Preview** (→ staging api / staging Supabase):
   `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, plus the optional
   `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_BRANDING_*`. Preview values point the
   staging web at the staging api + staging Supabase.

The [`vercel.json`](../../../services/web/vercel.json) `ignoreCommand` skips a build
when a push touched nothing under `services/web` or the shared packages ; that
applies to both environments.

> **Note on PR previews.** Because every non-production branch is a Vercel
> Preview, each **PR also gets its own ephemeral preview URL** ; but those share
> the _Preview_ env vars, so they talk to the **staging** api + Supabase. Treat
> PR previews as staging-data clients, not isolated sandboxes.
