---
type: runbook
---

# Add custom domains

Move the web app to `app.<yourdomain>` and the api to `api.<yourdomain>`. Do this only after the smoke test passes. About 30 minutes, mostly DNS propagation; both services redeploy.

## Before you start

- [ ] A passing [smoke test](smoke-test-a-deployment.md)
- [ ] Access to your domain's DNS

## Steps

1. In Vercel, open the project → **Settings → Domains**, add `app.<yourdomain>`, and create the CNAME record Vercel shows at your DNS provider. Vercel issues a certificate once DNS resolves.
2. In Render, open `monark-api` → **Settings → Custom Domains**, add `api.<yourdomain>`, and create the CNAME record Render shows. Render issues a certificate once DNS resolves.
3. In Render, update `monark-api` → **Environment**:

   | Key          | Value                      |
   | ------------ | -------------------------- |
   | `WEB_ORIGIN` | `https://app.<yourdomain>` |
   | `APP_URL`    | `https://app.<yourdomain>` |

   Then set `API_URL` in the `monark-cron-shared` group to `https://api.<yourdomain>`.

4. In Vercel, update **Settings → Environment Variables**, then redeploy the latest deployment:

   | Key                   | Value                      |
   | --------------------- | -------------------------- |
   | `NEXT_PUBLIC_API_URL` | `https://api.<yourdomain>` |
   | `NEXT_PUBLIC_APP_URL` | `https://app.<yourdomain>` |

5. In Supabase, under **Authentication → URL Configuration**, set **Site URL** to `https://app.<yourdomain>` and add `https://app.<yourdomain>/auth/confirm` and `https://app.<yourdomain>/auth/callback` to the redirect URLs. You can keep the old `vercel.app` entries for a grace period.

## Verify

```sh
curl -s https://api.<yourdomain>/health
```

Expect `{"status":"ok","service":"api"}`. Then run the [smoke test](smoke-test-a-deployment.md) again against `https://app.<yourdomain>`.

## If something goes wrong

| Symptom                             | Cause                                      | Fix                                                           |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Certificate stays pending           | CNAME not propagated, or a proxy in front  | Wait, or turn off any DNS proxy until the certificate issues. |
| App loads but calls to the api fail | Vercel not redeployed after the env change | Redeploy; `NEXT_PUBLIC_*` values are build-time.              |
| Email links point at the old host   | `APP_URL` not updated                      | Set it on the api.                                            |
