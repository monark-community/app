import "server-only";
import { cookies } from "next/headers";
import { isOAuthProvider, type OAuthProvider } from "@monark/auth/contracts";

export const OAUTH_LINK_COOKIE = "monark_oauth_link";
// Long enough to get through a provider's consent screen, short enough
// that an abandoned attempt doesn't leave the intent lying around.
const TTL_SECONDS = 60 * 10;

/**
 * Marks the *next* /auth/callback arrival as "connecting a provider to
 * the account I'm already signed in as", rather than a fresh sign-in.
 *
 * Why a cookie and not a query parameter. The callback has to treat the
 * two cases differently: a fresh sign-in must run `completeSignIn` (and
 * therefore the TOTP challenge), while a link must not — the session
 * already exists and already cleared that gate, so re-running it would
 * bounce the user to /signin/totp in the middle of an account-settings
 * action.
 *
 * That difference is exactly the kind of thing an attacker would want to
 * control. `?intent=link` on the redirect URL would be attacker-supplied
 * and would hand them a documented way to skip their own second factor.
 * An HTTP-only cookie can't be set from page JS, and the only thing that
 * sets it is the server action below — which requires a live session and
 * refuses while a TOTP challenge is pending. The middleware independently
 * keeps a TOTP-pending session away from /account, where the only link
 * button lives.
 */
export async function setOAuthLinkIntent(provider: OAuthProvider): Promise<void> {
  const store = await cookies();
  store.set(OAUTH_LINK_COOKIE, provider, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

/**
 * Reads and clears the intent in one step ; it is single-use so a stale
 * cookie can't reclassify a later genuine sign-in as a link. Returns
 * null when absent or when the value isn't a provider we offer.
 */
export async function consumeOAuthLinkIntent(): Promise<OAuthProvider | null> {
  const store = await cookies();
  const raw = store.get(OAUTH_LINK_COOKIE)?.value;
  if (!raw) return null;
  store.delete(OAUTH_LINK_COOKIE);
  return isOAuthProvider(raw) ? raw : null;
}
