# Phase 2 : Vercel : web

### 2.1 Import the repo

[vercel.com](https://vercel.com) → New Project → import this repo.

In the import dialog :

- **Root Directory** : `services/web`
- **Framework Preset** : Next.js (auto-detected)
- Build / install commands : leave on auto-detect ; Vercel reads them from [services/web/vercel.json](../../../services/web/vercel.json).

### 2.2 Set environment variables

Add these in the import dialog before clicking Deploy :

| Key                                    | Value                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | from 0.2                                                                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from 0.2 (the publishable / anon key, NOT secret)                              |
| `NEXT_PUBLIC_API_URL`                  | the api URL from 1.5                                                           |
| `NEXT_PUBLIC_APP_URL`                  | placeholder for now ; we'll update in Phase 3 once we know the real Vercel URL |

Don't add `SUPABASE_SECRET_KEY` here : the web service must NEVER read the service-role key.

Optional :

- **Error tracking** : `NEXT_PUBLIC_SENTRY_DSN` turns on browser + web-server Sentry. For readable production stack traces, also set `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` (source-map upload at build time ; a build without the token still succeeds). See [observability.md](.././observability.md).
- **White-label branding** : mirror the api's `BRANDING_*` vars with the `NEXT_PUBLIC_BRANDING_*` duplicates (`NEXT_PUBLIC_BRANDING_APP_NAME`, `NEXT_PUBLIC_BRANDING_PRIMARY`, …) so the browser bundle picks them up. See [white-label.md](.././white-label/_index.md).

### 2.3 Pin the region

Settings → Functions → Region → pick one matching the api's Render region. Cross-region tRPC calls cost 50–200 ms per round-trip ; co-locating cuts latency.

| api on Render | Vercel region    |
| ------------- | ---------------- |
| `oregon`      | `sfo1` or `pdx1` |
| `ohio`        | `iad1` or `cle1` |
| `frankfurt`   | `cdg1` or `fra1` |

### 2.4 Click Deploy

Vercel runs the build from the workspace root (`pnpm install --frozen-lockfile && pnpm gen && pnpm --filter web build`). Watch the build log.

Expected milestones :

- "Installing dependencies..." (~30 s with cache)
- "Generating events / routers..." (codegen)
- "Building Next.js..." (~1 min)
- "Compiled successfully" + the deploy URL

Once green, copy the Vercel URL ; `https://monark-<hash>.vercel.app` initially, or your project's primary URL.

---
