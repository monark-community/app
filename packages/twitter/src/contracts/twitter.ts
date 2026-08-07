/**
 * Shared Twitter/X-module constants, safe for both client and server. This is a
 * **write-only** integration (post / reply / delete a tweet) — X has no inbound
 * event webhook on any accessible API tier, so there are no domain events, no
 * inbound endpoint, and no triggers ; see [events.ts](./events.ts).
 *
 * Auth is **OAuth 1.0a user context** : four static credentials from the app's
 * X developer portal, stored per-org in the `@monark/secrets` substrate and used
 * to HMAC-SHA1-sign every request (there is no static bearer that can post on a
 * user's behalf). "Connected" == all four secrets exist. Nodes read them
 * directly (no per-node token fields), like Telegram's canonical bot token.
 */

export const TWITTER_CONSUMER_KEY_SECRET = "twitter.consumer-key";
export const TWITTER_CONSUMER_SECRET_SECRET = "twitter.consumer-secret";
export const TWITTER_ACCESS_TOKEN_SECRET = "twitter.access-token";
export const TWITTER_ACCESS_TOKEN_SECRET_SECRET = "twitter.access-token-secret";

/** Every secret key a Twitter connection owns, in one place (for status / disconnect). */
export const TWITTER_SECRET_KEYS = [
  TWITTER_CONSUMER_KEY_SECRET,
  TWITTER_CONSUMER_SECRET_SECRET,
  TWITTER_ACCESS_TOKEN_SECRET,
  TWITTER_ACCESS_TOKEN_SECRET_SECRET,
] as const;
