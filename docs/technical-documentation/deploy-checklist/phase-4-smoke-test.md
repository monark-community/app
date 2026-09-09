# Phase 4 : Smoke test

Hit the deployed app from a browser :

1. Open `https://monark.vercel.app`. The (anon) layout sees no session and lands you on `/signin`.
2. Click "Create account". Fill an email + password. Submit.
3. Wait 5–10 s for the verification email. Check the inbox of the email you signed up with ; Resend / Postmark dashboards also show outbound mail logs.
4. Click the verification link. Lands on `/account` with a confirmed account.
5. The first user to sign up + confirm gets `bootstrap` admin (per the api's `maybeBootstrapSingletonOrg` hook). Visit `/admin` to confirm.
6. Open `https://monark-api.onrender.com/health` directly : should return `{ "ok": true, "service": "api" }`.
7. (Optional) Test a webhook : `/admin/webhooks` → New endpoint pointing at `https://webhook.site/<your-uuid>` subscribed to `rbac.role-created` → create a role in `/admin/rbac` → check webhook.site for the delivery + the `Webhook-Signature` header.

If any step fails :

- **Sign-in bounces back to `/signin`** : check api logs for trusted-device errors. The `MONARK_AUTH_GATE_DEBUG=1` env var on the api makes the (authed) layout log which gate path fired.
- **Verification email never arrives** : check the SMTP provider's dashboard. Common gotcha : sender domain not verified yet.
- **`/admin` 404** : the singleton-org bootstrap didn't run. Check api logs for `Single-tenant bootstrap` lines.
- **Webhook delivery fails with "no plaintext secret available"** : you need to populate `WEBHOOK_SECRETS_JSON` on the api with the secret returned at endpoint creation. See [webhook-secret-resolver.md](.././webhook-secret-resolver/_index.md).

---
