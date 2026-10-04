---
type: runbook
---

# Set up social sign-in

Add "Continue with GitHub, Google or Microsoft" buttons to the sign-in and sign-up pages. Nothing is offered until you do this. About 20 minutes per provider; it touches the provider's developer console, Supabase, and the api's environment.

Three settings must agree, and each mismatch fails differently:

| Setting                           | Controls                                 | If it's wrong                         |
| --------------------------------- | ---------------------------------------- | ------------------------------------- |
| The provider's OAuth app          | whether the provider accepts the request | an error page at the provider         |
| Supabase's provider settings      | whether Supabase starts the flow         | `400` from `/auth/v1/authorize`       |
| `AUTH_OAUTH_PROVIDERS` on the api | whether the button appears               | no button, or a button that dead-ends |

The `auth.oauth` feature flag (on by default) is the kill switch above all three.

## Before you start

- [ ] Admin access to the provider's developer console
- [ ] Access to the Supabase project and the api's environment
- [ ] Your Supabase project ref (the `<project-ref>` in `https://<project-ref>.supabase.co`)

## Steps

1. Register an OAuth app with the provider. The redirect (callback) URL is Supabase's, not the app's:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   | Provider  | Slug     | Where to register                                                                                               | Watch for                                                                                                 |
   | --------- | -------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
   | GitHub    | `github` | **Settings → Developer settings → OAuth Apps → New OAuth App**                                                  | Users whose primary email is unverified or private are refused (`email-unverified`).                      |
   | Google    | `google` | Google Cloud console: **OAuth consent screen** first, then **Credentials → OAuth client ID → Web application**  | While the consent screen is in Testing, only listed test users can sign in.                               |
   | Microsoft | `azure`  | Entra ID: **App registrations → New registration**, redirect URI under **Web**, then **Certificates & secrets** | Choose the tenant up front. The client secret expires (24 months at most); put the renewal in a calendar. |

2. Copy the client id and secret.
3. In Supabase, open **Authentication → Providers**, enable the provider, and paste the id and secret.
4. In Supabase, under **Authentication → URL Configuration**, make sure the redirect URLs include `https://<web-host>/auth/callback`.
5. On the api, set `AUTH_OAUTH_PROVIDERS` to the enabled slugs, comma-separated:
   ```text
   AUTH_OAUTH_PROVIDERS=github,google,azure
   ```
   On Render, add it under `monark-api` → **Environment**; saving redeploys.

## Verify

```sh
curl -sD - "https://<project-ref>.supabase.co/auth/v1/authorize?provider=github" | head -1
```

Expect a `302` to the provider; a `400` means Supabase won't start the flow. Then open the sign-in page, click **Continue with GitHub**, and finish the round trip. A new user lands in the app; an existing user can connect the provider from their account security page.

## Turn a provider on locally

1. Register the app with `http://127.0.0.1:54321/auth/v1/callback` as the redirect URL. For Microsoft use `http://localhost:54321/auth/v1/callback`; Entra rejects `127.0.0.1`.
2. Put the credentials in a root `.env` (gitignored). The Supabase CLI reads it, not `services/api/.env`. Note `_SECRET`, not `_CLIENT_SECRET`:
   ```text
   SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=<id>
   SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=<secret>
   ```
3. Set `enabled = true` in that provider's `[auth.external.*]` block in `supabase/config.toml`. Don't commit it.
4. Add the slug to `AUTH_OAUTH_PROVIDERS` in `services/api/.env`.
5. Restart Supabase, then restart `pnpm dev`:
   ```sh
   pnpm supabase stop && pnpm supabase start
   ```
6. Check the credentials resolved. A length of 44 means the `env()` placeholder came through unresolved:
   ```sh
   docker exec supabase_auth_app sh -c 'echo len=${#GOTRUE_EXTERNAL_GITHUB_CLIENT_ID}'
   ```

## If something goes wrong

| Symptom                                                         | Cause                                                               | Fix                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| No button on the sign-in page                                   | slug missing from `AUTH_OAUTH_PROVIDERS`, or `auth.oauth` is off    | Add the slug and restart the api.                                                   |
| Error at the provider, never returns                            | redirect URL registered with the provider isn't Supabase's callback | Register the exact callback URL.                                                    |
| `400` with `Unsupported provider: missing redirect URI` (local) | `redirect_uri` empty or missing in the `config.toml` block          | Set it to the local callback URL.                                                   |
| Credential length reads `44` (local)                            | credentials not in the root `.env`                                  | Move them there, then restart Supabase.                                             |
| Back on sign-in with `?oauthError=exchange-failed`              | code expired or replayed, or the browser dropped the cookie         | Retry in a normal browser window.                                                   |
| `?oauthError=email-unverified`                                  | the provider didn't vouch for the email                             | The user verifies the email with the provider first.                                |
| `?oauthError=email-collision`                                   | another account already uses that email                             | The user signs in with their password and connects the provider from their account. |
| `?oauthError=disabled`                                          | the `auth.oauth` flag is off                                        | Remove the override that turned it off.                                             |
| Google nonce mismatch (local only)                              | local Google config                                                 | Set `skip_nonce_check = true` locally; never on a hosted project.                   |

Next: [Rebrand an instance](rebrand-an-instance.md)
