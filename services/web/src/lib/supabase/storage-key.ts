/**
 * The cookie / localStorage key both Supabase clients (server +
 * browser) use to read and write the auth session. Pinned to a
 * constant rather than letting supabase-js derive it from the URL :
 * the dev-host rewrite changes the URL the browser hits, which would
 * change the derived key and silently desync the browser from the
 * cookies the server set. With an explicit name, both sides stay in
 * sync regardless of which URL each one is configured with.
 *
 * The `BRANDING_AUTH_STORAGE_KEY` env var lets a downstream team
 * pick a project-specific name (avoids cookie collisions when two
 * apps share a domain) ; defaults to a short generic value.
 */
export const SUPABASE_AUTH_STORAGE_KEY =
  process.env.NEXT_PUBLIC_AUTH_STORAGE_KEY ?? "sb-app-auth-token"
