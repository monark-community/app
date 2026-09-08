# Social sign-in setup

Operator runbook for the "Continue with …" buttons on `/signin` and `/signup`. Covers what to register with each vendor, where the credentials go, and how to tell which of the three moving parts is misconfigured when it doesn't work.

For how the feature behaves once it's on (provisioning, refusal reasons, the TOTP interaction, linking and unlinking) see [`packages/auth/README.md`](../../packages/auth/README.md). This page is only about configuration.

## Nothing is on by default

A deployment that hasn't registered OAuth apps with any vendor behaves exactly as it did before the feature existed: no buttons, no code paths reached. That's deliberate, and it means turning a provider on is always three explicit steps rather than a deploy that silently starts offering something.

## The three moving parts

They have to agree, and each one failing produces a different symptom:

| Part           | Where                                                                                                                     | What it controls                                 | If it's wrong                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| **The vendor** | The provider's own developer console                                                                                      | Whether the authorize request is accepted at all | Error page at the provider                        |
| **Supabase**   | `[auth.external.*]` in [supabase/config.toml](../../supabase/config.toml) locally, Authentication → Providers when hosted | Whether Supabase will start the flow             | `400` from `/auth/v1/authorize`                   |
| **The api**    | `AUTH_OAUTH_PROVIDERS` in `services/api/.env`                                                                             | Whether the button renders                       | No button, or a button that fails at the provider |

The api env is the list of slugs `auth.oauth.providers` returns to the sign-in page. A provider configured in Supabase but missing from that list renders no button; one listed there but not configured in Supabase renders a button that dead-ends at the vendor.

On top of all three sits the `auth.oauth` feature flag (default on) as a kill switch ; off means no buttons and a callback that refuses to provision, so a round trip already in flight can't land an account.

## The callback URL is Supabase's, not ours

The single most common setup mistake. The redirect URI you register **with the vendor** points at Supabase:

```
http://127.0.0.1:54321/auth/v1/callback          # local
https://<project-ref>.supabase.co/auth/v1/callback # hosted
```

Supabase then bounces the browser to `<app-origin>/auth/callback`, which is our route. _That_ URL is the one that has to appear in `additional_redirect_urls` in [supabase/config.toml](../../supabase/config.toml) ; it already lists `localhost:3000` plus RFC 1918 wildcards so a phone on the LAN works.

## Two traps that cost real time

Both were hit bringing the first provider up, and neither fails loudly.

### `env()` resolves from the Supabase CLI's environment

The `client_id` / `secret` fields in `config.toml` use `env(...)` so nothing credential-shaped is committed. Those refs are resolved by the **Supabase CLI**, from its own environment or a `.env` in the directory you run `supabase start` from. It does **not** read `services/api/.env`.

Put provider credentials in a **root `.env`** (gitignored), with names matching the stanza exactly:

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
```

Note `_SECRET`, not `_CLIENT_SECRET`. When the CLI can't resolve a ref it doesn't error ; it forwards the literal string `env(SUPABASE_AUTH_EXTERNAL_…)` to GoTrue, and the failure only surfaces much later as an opaque provider error. A client-id length of **44** is that placeholder, not a key.

### `redirect_uri` has to be set explicitly

The upstream config template ships `redirect_uri = ""` and documents it as an optional override, but CLI 2.98.2 never substitutes a default: an empty value _and_ an absent key both leave `GOTRUE_EXTERNAL_<PROVIDER>_REDIRECT_URI` blank in the auth container, and every authorize call then fails with `validation_failed: Unsupported provider: missing redirect URI`. The stanzas in this repo set it to the local callback for that reason. Hosted projects derive it themselves.

## Turning a provider on locally

1. Register the app with the vendor (per-provider sections below), using `http://127.0.0.1:54321/auth/v1/callback` as the redirect URI.
2. Add the id + secret to the **root `.env`**.
3. Flip `enabled = true` in that provider's `[auth.external.*]` stanza. Keep this local ; every provider ships disabled.
4. Add the slug to `AUTH_OAUTH_PROVIDERS` in `services/api/.env` (comma-separated, e.g. `github,google`).
5. `pnpm supabase stop && pnpm supabase start` ; the auth container reads provider config at boot, so a restart is required.
6. Restart `pnpm dev` so the api picks up the new env.

## Verifying before you click anything

Two checks that localise a failure in seconds:

```sh
# Did the credentials resolve? ~44 means the env() placeholder came through unresolved.
docker exec supabase_auth_app sh -c 'echo len=${#GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID}'

# Will Supabase start the flow? Want a 302 to the provider ; 400 means it won't.
curl -sD - "http://127.0.0.1:54321/auth/v1/authorize?provider=google" | head -1
```

`/auth/v1/settings` lists every provider the container currently believes is enabled:

```sh
curl -s http://127.0.0.1:54321/auth/v1/settings
```

## Per-provider

### GitHub

**Where:** Settings → Developer settings → OAuth Apps → New OAuth App.

Homepage URL can be anything; the Authorization callback URL is Supabase's. Nothing to verify or review, which makes GitHub the quickest provider to stand up for testing.

**Watch out for:** an account whose primary address is unverified or private comes back without a verified email, and our callback refuses it with `email-unverified`. That's intended ; accepting an unverified address would let anyone who can attach it to a throwaway provider account take over the matching Monark account. The user verifies with GitHub first.

### Google

**Where:** Google Cloud console → APIs & Services → **OAuth consent screen** first, then **Credentials** → Create credentials → OAuth client ID → **Web application**.

- The consent screen has to exist before the client will work. While it's in _Testing_, only accounts listed under **Test users** can sign in ; add your own, or publish the screen.
- App verification is only required for **sensitive** scopes. The plain email + profile scopes used here need none, so a fresh client works immediately.

**Watch out for:** a local sign-in that fails on a **nonce mismatch** wants `skip_nonce_check = true` in the local config **only** ; never carry that into a hosted project. Google is also the one provider here that sends the avatar as `picture` rather than `avatar_url`, which is why `extractOAuthProfile` checks both keys; nothing to configure, but it explains the extra branch if you're reading that code.

## Hosted projects

Same three parts, different second one: instead of `config.toml`, configure the provider under **Authentication → Providers** in the Supabase dashboard, and register the vendor redirect URI against `https://<project-ref>.supabase.co/auth/v1/callback`. `AUTH_OAUTH_PROVIDERS` still has to list the slug on the api, and `additional_redirect_urls` still has to allow the app origin. The `redirect_uri` trap doesn't apply ; the platform derives it.

## What the user ends up with

Once a provider is on, `/account/security` lists every way the account can be reached:

![Connected accounts, with a provider and a password](../assets/connected-accounts.png)

Either row can be disconnected here, because losing one still leaves a way in.

An account that signed up **through a provider** has no password, so that provider is the only way in and there is nothing to disconnect. The card says so rather than offering a button that would strand the account, and points at the password card on the same page:

![Connected accounts on a provider-only account](../assets/connected-accounts-only-method.png)

That second state is the answer to "why is there no Disconnect button?" ; the server refuses it too (`assertCanUnlinkProvider` returns `last-method`), so the UI is agreeing with the API rather than second-guessing it.

Figures regenerate with `pnpm --filter web figures connected-accounts connected-accounts-only-method`.

## Troubleshooting by symptom

| Symptom                                              | Cause                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| No button on `/signin`                               | Slug missing from `AUTH_OAUTH_PROVIDERS`, or the `auth.oauth` flag is off         |
| `400` + `Unsupported provider: missing redirect URI` | `redirect_uri` empty or absent in the stanza                                      |
| `docker exec … ${#…CLIENT_ID}` reads `44`            | `env()` ref unresolved ; credentials aren't where the CLI looks (root `.env`)     |
| Error at the vendor, never returns                   | Redirect URI registered with the vendor doesn't match Supabase's callback         |
| Returns to `/signin?oauthError=exchange-failed`      | Code expired or replayed, or the PKCE cookie was dropped                          |
| `?oauthError=email-unverified`                       | Provider didn't vouch for the address ; user verifies with the provider first     |
| `?oauthError=email-collision`                        | A different `User` row already owns that email ; sign in with a password and link |
| `?oauthError=disabled`                               | The `auth.oauth` kill switch is off                                               |
| Nonce mismatch (Google)                              | `skip_nonce_check = true`, local config only                                      |

## Not wired

**Microsoft (`azure`)** is a separate change in flight. **Apple** is further out: it needs a paid developer account, a client secret that is a JWT requiring regeneration every six months, and it only returns the user's name on the _first_ authorization.
