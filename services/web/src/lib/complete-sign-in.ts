import "server-only";
import { createServerTrpcClient } from "./trpc-server";
import { recognizeDeviceAfterAuth } from "./trusted-device-cookie";
import { clearTotpPending, setTotpPending } from "./totp-pending-cookie";

/**
 * Everything that has to happen between "a Supabase session cookie now
 * exists" and "the user is allowed to see the app", in one place.
 *
 * Password sign-in and social sign-in reach this point by completely
 * different routes ; the steps afterwards are identical, and the TOTP
 * gate in particular is not optional. A second entry point that set a
 * session without running this sequence would be a two-factor bypass:
 * enrol an authenticator, then sign in with Google and skip the
 * challenge entirely.
 *
 * Returns the path the caller should send the user to. It doesn't
 * redirect itself so both callers can use their own mechanism — a
 * server action calls `redirect()`, a route handler builds a
 * `NextResponse.redirect` against the request's real origin.
 */
export async function completeSignIn(accessToken: string): Promise<string> {
  const trustedDeviceId = await recognizeDeviceAfterAuth(accessToken);
  const api = createServerTrpcClient(accessToken);

  // TOTP-gated sign-ins land at /signin/totp; the session cookie is live but
  // the middleware pending-gate keeps the user from reaching protected
  // routes until a code is verified. notifySignedIn waits until then so the
  // event fires once the sign-in is fully complete.
  const challengeRequired = await api.auth.totp.isChallengeRequired
    .query({ trustedDeviceId })
    .catch(() => false);

  if (challengeRequired) {
    await setTotpPending(trustedDeviceId);
    return "/signin/totp";
  }

  await clearTotpPending();
  await api.auth.notifySignedIn
    .mutate(trustedDeviceId ? { trustedDeviceId } : undefined)
    .catch(() => {
      // Event emission is best-effort; the session cookie is already set.
    });
  // Auto-accept any pending invites for this user's email — covers the
  // "admin invited me, then I signed in" path. Idempotent so the call
  // is safe on every sign-in. Best-effort : a failure here doesn't
  // block the sign-in itself.
  await api.organizations.invites.consumePending.mutate().catch(() => {});

  // Land deletion-pending users straight on the danger tab so the
  // grace-period banner + Cancel button are the first thing they see.
  // `users.me` returns the shadow row with `deletedAt` set when the
  // account is in the 14-day grace window. The (authed) layout's
  // own redirect logic also forwards them there for any subsequent
  // navigation, but bouncing here saves an extra round-trip on the
  // first request right after sign-in.
  const me = await api.users.me.query().catch(() => null);
  if (me?.deletedAt) return "/account/danger";
  return "/account";
}
