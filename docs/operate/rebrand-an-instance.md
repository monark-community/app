---
type: runbook
---

# Rebrand an instance

Give an instance its own product name, colours, logo, favicon and auth emails. The code ships with neutral placeholders (product name `App`, a blue accent, an `example.com` support address), so branding is configuration, not a code change. About 30 minutes, plus a redeploy of both services.

Every user-visible name and colour flows through one module, `@monark/branding`, read on both server and browser; see [Architecture](../concepts/architecture/_index.md). Package names, the query language name, the `mrk_` API key prefix and the `monark_*` MCP tool names stay fixed, because integrations depend on them.

## Before you start

- [ ] Access to the api's and web app's environment variables
- [ ] Your logo as a square JPEG, PNG or WebP under 2 MB, and a favicon (`.ico`)
- [ ] The final authenticator name (TOTP issuer). Changing it after launch forces every user to re-enroll two-factor.
- [ ] Administrator access to the running app

## Steps

1. On the api, set the branding variables. Quote hex values:
   ```text
   BRANDING_APP_NAME=Acme
   BRANDING_TAGLINE=Projects, clients and everything between.
   BRANDING_SUPPORT_EMAIL=support@acme.com
   BRANDING_TOTP_ISSUER=Acme
   BRANDING_FROM_EMAIL=Acme <noreply@acme.com>
   BRANDING_PRIMARY="#E4572E"
   BRANDING_ACCENT="#F3A712"
   ```
   The full list and defaults are in [Environment variables](../reference/environment-variables.md#branding).
2. On the web app, set the `NEXT_PUBLIC_` mirror of each value the browser shows: `NEXT_PUBLIC_BRANDING_APP_NAME`, `_TAGLINE`, `_SUPPORT_EMAIL`, `_PRIMARY`, `_ACCENT`, `_LOGO_SRC`. Use the same values as the api, then redeploy the web app.
3. Set the organization's colour, which themes the whole UI and wins over `BRANDING_PRIMARY`: in **Admin → Organizations**, open the organization, set **Primary brand color**, and save. On a fresh database, `INITIAL_ORG_PRIMARY_COLOR` does the same at first boot.
4. On the same page, upload the logo. It's the logo the app shows once the organization exists, and app-sent emails use it too.
5. For screens shown before an organization exists, put a logo file in `services/web/public/` and set `BRANDING_LOGO_SRC` (and `NEXT_PUBLIC_BRANDING_LOGO_SRC`) to its path, for example `/acme-logo.svg`.
6. Replace `services/web/src/app/favicon.ico` with your favicon. There's no variable for it. A fork can delete `services/web/public/monark-favicon.ico` and `monark-logo.svg`, which belong to Monark's own deployment.
7. Brand the three emails Supabase sends (signup confirmation, password reset, email change). They can't read the branding variables.
   1. In each of `supabase/templates/confirmation.html`, `recovery.html` and `email-change.html`, fill the commented wordmark slot (prefer text over an image) and replace the `#18181b` accent with your colour.
   2. Set the three `subject` lines under `[auth.email.template.*]` in `supabase/config.toml`.
   3. For a hosted project, copy each template and subject into the Supabase dashboard's email templates.
8. Commit the file changes from steps 5 to 7 and deploy both services.

## Verify

Sign out and open the sign-in page: it shows your logo, name and tagline on your colour. Request a password reset and check the email's wording and colour. Enroll two-factor on a test account and check the name your authenticator app shows.

## If something goes wrong

| Symptom                                               | Cause                                                                                          | Fix                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Colour ignored, defaults to blue                      | hex value unquoted, so it parsed as empty                                                      | Quote it: `"#E4572E"`.                     |
| Server-rendered text branded, browser text says `App` | `NEXT_PUBLIC_BRANDING_*` missing, or web not redeployed                                        | Set the mirrors and redeploy.              |
| Logo upload fails                                     | `SUPABASE_URL` / `SUPABASE_SECRET_KEY` missing on the web app, or the file is SVG or over 2 MB | Add the variables; use JPEG, PNG or WebP.  |
| Broken image on the sign-in page                      | `BRANDING_LOGO_SRC` points at a missing file                                                   | Add the file under `services/web/public/`. |
| Auth emails still neutral (hosted)                    | templates edited only in the repo                                                              | Copy them into the Supabase dashboard.     |

Next: [Turn on error tracking](turn-on-error-tracking.md)
