---
type: runbook
---

# Deploy the web app to Vercel

Publish the web app, then point the api and Supabase at its real URL. About 15 minutes; it creates a Vercel project and redeploys the api once.

## Before you start

- [ ] The api is live and you have its URL ([Deploy the api to Render](deploy-the-api-to-render.md))
- [ ] A Vercel account with access to the GitHub repository

## Steps

1. In Vercel, choose **Add New → Project** and import the repository. Set **Root Directory** to `services/web`; leave the build settings on auto-detect. Vercel reads `services/web/vercel.json`, which installs and runs `pnpm gen && pnpm --filter web build` from the workspace root.
2. Before deploying, add these environment variables:

   | Key                                    | Value                                                                                                                                       |
   | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL                                                                                                                        |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key                                                                                                                    |
   | `NEXT_PUBLIC_API_URL`                  | the api URL                                                                                                                                 |
   | `NEXT_PUBLIC_APP_URL`                  | `https://monark.vercel.app` (placeholder)                                                                                                   |
   | `SUPABASE_URL`                         | Supabase project URL                                                                                                                        |
   | `SUPABASE_SECRET_KEY`                  | Supabase secret key. Server-only: never add it with a `NEXT_PUBLIC_` prefix. Admin actions such as uploading the organization logo need it. |

3. Click **Deploy** and wait for the build to finish. Copy the deployment's URL.
4. Pin the region under **Settings → Functions** to match the api's Render region:

   | Render region | Vercel region    |
   | ------------- | ---------------- |
   | `oregon`      | `sfo1` or `pdx1` |
   | `ohio`        | `iad1` or `cle1` |
   | `frankfurt`   | `fra1` or `cdg1` |

5. In Vercel, set `NEXT_PUBLIC_APP_URL` to the real URL, then redeploy the latest deployment. `NEXT_PUBLIC_*` values are compiled into the build, so saving them alone changes nothing.
6. In Render, open `monark-api` → **Environment** and set both `WEB_ORIGIN` and `APP_URL` to the web URL. Save; Render redeploys.
7. In Supabase, under **Authentication → URL Configuration**, set **Site URL** to the web URL and add these redirect URLs:
   ```text
   https://<web-host>/auth/confirm
   https://<web-host>/auth/callback
   ```
   The change is live immediately.

## Verify

Open the web URL. You land on the sign-in page, which reads "Sign in to continue to" followed by your organization's name.

## If something goes wrong

| Symptom                                                        | Cause                                                                            | Fix                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Build fails at `pnpm gen`                                      | Root Directory isn't `services/web`                                              | Fix it under **Settings → Build and Deployment** and redeploy.            |
| Sign-in page loads but every action fails with a network error | `NEXT_PUBLIC_API_URL` wrong, or the api's `WEB_ORIGIN` doesn't match the web URL | Correct both; redeploy the web app after changing a `NEXT_PUBLIC_` value. |
| Uploading the organization logo fails                          | `SUPABASE_URL` or `SUPABASE_SECRET_KEY` missing on Vercel                        | Add both (no `NEXT_PUBLIC_` prefix) and redeploy.                         |
| Confirmation link ends on an error page                        | redirect URLs missing in Supabase                                                | Add both `/auth/` URLs from step 7.                                       |

Next: [Smoke-test a deployment](smoke-test-a-deployment.md)
