/**
 * Social sign-in ("continue with Google / Microsoft / GitHub").
 *
 * The ids below are **Supabase's own provider slugs**, not names we
 * picked ; they travel verbatim into `supabase.auth.signInWithOAuth({
 * provider })` on the browser and come back out of the auth user's
 * `app_metadata.provider`. Microsoft Entra ID is `azure` in Supabase's
 * vocabulary, so that's the id we carry end to end rather than
 * maintaining a display-name-to-slug mapping in two directions. The
 * human label lives in `OAUTH_PROVIDER_LABELS`.
 */
export const OAUTH_PROVIDERS = ["google", "azure", "github"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Brand names, deliberately **not** localized ; a product name reads the
 * same in every catalog (see docs/agents/i18n.md). The surrounding
 * sentence ("Continue with {provider}") is what goes through i18n.
 */
export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "Google",
  azure: "Microsoft",
  github: "GitHub",
};

/**
 * Why a first-time social sign-in can be refused. The web callback maps
 * each to a `?oauthError=` banner on /signin, so every value here needs
 * a matching `auth.signIn.banners.oauthError.*` key in en + fr.
 *
 * - `no-email` : the provider returned an account with no email address
 *   at all. Nothing to key a shadow `User` row on.
 * - `email-unverified` : the provider knows the address but hasn't
 *   verified it (GitHub's most common shape). Accepting it would let
 *   anyone who can attach an unverified address to a throwaway provider
 *   account take over the matching Monark account.
 * - `email-collision` : a different `User` row already owns that
 *   address. Supabase links identities itself when the provider email
 *   is verified, so reaching this means the two sides disagree ; refuse
 *   rather than guess.
 * - `disabled` : the `auth.oauth` kill switch is off.
 * - `exchange-failed` : the authorization code Supabase handed back
 *   didn't exchange into a session (expired, replayed, or a mismatched
 *   PKCE verifier because the browser dropped the cookie).
 */
export type OAuthRefusalReason =
  | "no-email"
  | "email-unverified"
  | "email-collision"
  | "disabled"
  | "exchange-failed";

export type OAuthProvisionResult =
  | { ok: true; created: boolean; provider: OAuthProvider | null }
  | { ok: false; reason: OAuthRefusalReason };

/**
 * What the account pages need to know about how a user can
 * authenticate. `hasPassword` false means every password-gated flow
 * (change password, change email) has to offer a "set a password"
 * detour instead of a current-password field.
 */
export type IdentityStatus = {
  hasPassword: boolean;
  providers: OAuthProvider[];
};
