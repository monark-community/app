# Phase 5 : Custom domains (optional, do this once smoke passes)

### 5.1 Vercel : `app.yourdomain.com`

Vercel project → Settings → Domains → Add. Vercel gives you DNS records to add at your registrar (CNAME pointing at `cname.vercel-dns.com`).

After DNS propagates (~5–60 min), Vercel auto-provisions a TLS cert.

### 5.2 Render : `api.yourdomain.com`

Render `monark-api` → Settings → Custom Domains → Add. Render gives you a CNAME target (`<service>.onrender.com`).

After DNS propagates, Render provisions a TLS cert too.

### 5.3 Update env vars to the custom domains

Render `monark-api` → Environment :

| Key          | New value                    |
| ------------ | ---------------------------- |
| `WEB_ORIGIN` | `https://app.yourdomain.com` |
| `APP_URL`    | `https://app.yourdomain.com` |

Update `monark-cron-shared.API_URL` to `https://api.yourdomain.com`.

Vercel project → Environment Variables :

| Key                   | New value                    |
| --------------------- | ---------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com` |
| `NEXT_PUBLIC_APP_URL` | `https://app.yourdomain.com` |

Both platforms auto-redeploy on env-var changes. Wait ~3 min.

### 5.4 Update Supabase Auth URL configuration

Supabase → Authentication → URL Configuration :

- **Site URL** → `https://app.yourdomain.com`
- **Redirect URLs** → add the new auth paths under the custom domain ; you can leave the old `*.vercel.app` paths in for a grace period.

### 5.5 Re-smoke

Run Phase 4 again against the custom domain to confirm everything still works end-to-end.

---
