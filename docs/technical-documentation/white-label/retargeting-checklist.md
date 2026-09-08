# Retargeting checklist

1. **Set the `BRANDING_*` env vars** for your product on the api service, and the
   `NEXT_PUBLIC_BRANDING_*` duplicates on the web service (see the table above).
   **Quote any hex value** ; an unquoted leading `#` is read as a comment by
   Node's `--env-file` parser and silently resolves to an empty string.
2. **Upload the org logo.** For a single-tenant deploy this is the logo that
   actually renders: `/admin/organizations/<id>` → Organization profile. It takes
   a **square JPEG, PNG or WebP** (max 2 MB) (not SVG) and is stored per-org, so
   it also reaches the emails the app itself sends.
   `BRANDING_LOGO_SRC` is the fallback for surfaces rendered before an org logo
   exists — a fresh deploy, or the sign-in screen before provisioning ; point it
   at a file you drop into
   `services/web/public/`.
3. **Replace the favicon.** `services/web/src/app/favicon.ico` ships as a neutral
   placeholder generated from `public/logo.svg`. There is no env var for it ;
   Next serves the file as-is, so swap the file. (Monark's own assets are kept
   at `services/web/public/monark-favicon.ico` and `monark-logo.svg` for that
   deployment to restore ; a fork deletes them.)
4. **Brand the three auth emails.** Signup confirmation, password reset and email
   change are rendered by **Supabase**, not by `@monark/notifications`, so they
   cannot read `BRANDING`. They ship brand-neutral. See "Auth emails" below.
5. **Pick the TOTP issuer before launch.** It is what users see in their
   authenticator app next to their account label ; changing it later forces every
   user to re-enroll.
6. **Provision the organization** (single-tenant deploys). See below.
