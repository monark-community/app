import { emit, logger, UnauthorizedError } from "@monark/common";
import { getDb } from "@monark/db";
import { getById } from "@monark/users/server";
import type { UserSignedUpEvent } from "../contracts/events";
import {
  isOAuthProvider,
  type IdentityStatus,
  type OAuthProvider,
  type OAuthProvisionResult,
} from "../contracts/oauth";
import { markEmailVerified } from "./email-verification";
import { getSupabaseAdmin } from "./supabase-admin";

/**
 * The slice of a Supabase auth user this module reads. Declared
 * structurally rather than importing `@supabase/supabase-js`'s `User`
 * so the extractor below stays a pure function we can unit-test with a
 * plain object literal, and so `user_metadata`'s `any`-typed index
 * signature doesn't leak `any` into our call sites.
 */
export type OAuthAuthUserLike = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  identities?: Array<{
    provider: string;
    identity_data?: Record<string, unknown> | null;
  }> | null;
};

export type OAuthProfile = {
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  provider: OAuthProvider | null;
};

// `User.displayName` is capped at 80 by `signUpInputSchema` ; provider
// names arrive unbounded so clamp to the same ceiling rather than
// letting a 4KB "full_name" through.
const MAX_DISPLAY_NAME = 80;
const MAX_AVATAR_URL = 2048;

function readString(bag: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = bag?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readStringArray(bag: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = bag?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

// Providers disagree on which key holds the human's name : Google and
// Microsoft send `full_name` / `name`, GitHub sends `user_name` when the
// profile has no real name set. First non-empty wins.
const DISPLAY_NAME_KEYS = ["full_name", "name", "user_name", "preferred_username"];
// Google uses `picture` ; GitHub and Microsoft use `avatar_url`.
const AVATAR_KEYS = ["avatar_url", "picture"];

/**
 * Normalizes a Supabase auth user into the fields our shadow `User` row
 * needs. Pure ; no I/O, so the provider-metadata quirks above are
 * covered by unit tests rather than only by a live OAuth round trip.
 *
 * `emailVerified` deliberately accepts either signal : Supabase stamps
 * `email_confirmed_at` when it trusts the provider's assertion, and the
 * providers themselves echo `email_verified` into user metadata. Either
 * one is the provider vouching for the address ; neither means we
 * refuse the sign-in (see `OAuthRefusalReason`).
 */
export function extractOAuthProfile(user: OAuthAuthUserLike): OAuthProfile {
  const meta = user.user_metadata ?? null;

  const rawEmail = typeof user.email === "string" ? user.email.trim() : "";
  const email = rawEmail.length > 0 ? rawEmail.toLowerCase() : null;

  const confirmedAt = typeof user.email_confirmed_at === "string" ? user.email_confirmed_at : "";
  const emailVerified = confirmedAt.length > 0 || meta?.["email_verified"] === true;

  let displayName: string | null = null;
  for (const key of DISPLAY_NAME_KEYS) {
    displayName = readString(meta, key);
    if (displayName) break;
  }
  if (displayName && displayName.length > MAX_DISPLAY_NAME) {
    displayName = displayName.slice(0, MAX_DISPLAY_NAME);
  }

  let avatarUrl: string | null = null;
  for (const key of AVATAR_KEYS) {
    avatarUrl = readString(meta, key);
    if (avatarUrl) break;
  }
  if (avatarUrl && (avatarUrl.length > MAX_AVATAR_URL || !/^https?:\/\//i.test(avatarUrl))) {
    avatarUrl = null;
  }

  return { email, emailVerified, displayName, avatarUrl, provider: pickProvider(user) };
}

// `app_metadata.provider` is the provider that established the *current*
// session ; `providers` is every identity linked to the account. Fall
// back to the identities array when neither is one of ours (a
// password-first account that later linked Google reports
// `provider: "email"`).
function pickProvider(user: OAuthAuthUserLike): OAuthProvider | null {
  const appMeta = user.app_metadata ?? null;
  const primary = readString(appMeta, "provider");
  if (primary && isOAuthProvider(primary)) return primary;
  for (const candidate of readStringArray(appMeta, "providers")) {
    if (isOAuthProvider(candidate)) return candidate;
  }
  for (const identity of user.identities ?? []) {
    if (isOAuthProvider(identity.provider)) return identity.provider;
  }
  return null;
}

/**
 * Reads which credentials an account actually has. `hasPassword` keys
 * off the presence of Supabase's `email` identity ; an OAuth-only user
 * has none, which is what the account pages branch on before rendering
 * a "current password" field they could never satisfy.
 */
export async function readIdentityStatus(userId: string): Promise<IdentityStatus> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    logger.warn({ err: error, userId }, "identity status lookup failed");
    return { hasPassword: false, providers: [] };
  }
  const identities = data.user.identities ?? [];
  const providers: OAuthProvider[] = [];
  let hasPassword = false;
  for (const identity of identities) {
    if (identity.provider === "email") hasPassword = true;
    else if (isOAuthProvider(identity.provider) && !providers.includes(identity.provider)) {
      providers.push(identity.provider);
    }
  }
  return { hasPassword, providers };
}

/**
 * Creates the shadow `User` row for a social sign-in, or backfills the
 * one that already exists.
 *
 * Why this exists : `signUpUser` is the only other path that ever
 * writes a `User` row, and it drives the Supabase side itself. OAuth
 * inverts that ; Supabase creates `auth.users` while the browser is off
 * at the provider, and the first thing our stack hears about it is a
 * session cookie for an id we've never seen. Without this call the user
 * lands authenticated but shadow-less, and every downstream read
 * (`users.me`, memberships, RBAC, notifications) comes back empty.
 *
 * Identity is re-read from the Supabase **admin** API rather than
 * trusted from the caller : the web layer forwards only its access
 * token, so `ctx.userId` is the sole authenticated input and email /
 * name / avatar all come from the authoritative record. A caller
 * holding a valid token for account A therefore can't claim account
 * B's address and steer the collision check.
 *
 * Idempotent : safe to call on every social sign-in, not just the
 * first. Repeat calls only backfill profile fields that are still null.
 */
export async function provisionOAuthUser(input: {
  userId: string;
  localePreference?: "en" | "fr";
}): Promise<OAuthProvisionResult> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.getUserById(input.userId);
  if (error || !data.user) {
    logger.error({ err: error, userId: input.userId }, "oauth provision: auth user not found");
    throw new UnauthorizedError();
  }

  const profile = extractOAuthProfile(data.user);
  if (!profile.email) return { ok: false, reason: "no-email" };
  if (!profile.emailVerified) {
    logger.info(
      { userId: input.userId, provider: profile.provider },
      "oauth provision refused: provider did not verify the email",
    );
    return { ok: false, reason: "email-unverified" };
  }

  const db = getDb();
  const existing = await getById(input.userId);

  if (existing) {
    // Established account signing in again (or a password account whose
    // identity Supabase just linked to a provider). Only fill in what's
    // still empty ; a name or avatar the user set themselves outranks
    // whatever the provider says today.
    const patch: { displayName?: string; avatarUrl?: string } = {};
    if (!existing.displayName && profile.displayName) patch.displayName = profile.displayName;
    if (!existing.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl;
    if (Object.keys(patch).length > 0) {
      await db.user.update({ where: { id: existing.id }, data: patch });
    }
    // No-op when already stamped ; covers the account that signed up by
    // password, never clicked the confirmation link, and has now proved
    // ownership of the same address through the provider instead.
    await markEmailVerified(existing.id);
    return { ok: true, created: false, provider: profile.provider };
  }

  // Case-insensitive on purpose : Supabase lowercases every address it
  // stores, but `signUpUser` persists whatever casing the signup form
  // submitted, so a plain equality check would miss "Foo@Bar.com" and
  // we'd mint a second row for the same human.
  const byEmail = await db.user.findFirst({
    where: { email: { equals: profile.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (byEmail && byEmail.id !== input.userId) {
    logger.warn(
      { userId: input.userId, conflictingUserId: byEmail.id },
      "oauth provision refused: email already owned by another user row",
    );
    return { ok: false, reason: "email-collision" };
  }

  await db.user.create({
    data: {
      id: input.userId,
      email: profile.email,
      // Left null here and stamped by `markEmailVerified` below so the
      // `user.email-verified` event fires exactly once for social
      // signups too, the same way the emailed-link path does.
      emailVerifiedAt: null,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      ...(input.localePreference ? { localePreference: input.localePreference } : {}),
    },
  });

  const event: UserSignedUpEvent = {
    type: "user.signed-up",
    userId: input.userId,
    email: profile.email,
    provider: profile.provider ?? undefined,
    occurredAt: new Date(),
  };
  await emit(event);
  await markEmailVerified(input.userId);

  return { ok: true, created: true, provider: profile.provider };
}

/**
 * Which providers this deployment offers, read from the api's
 * `AUTH_OAUTH_PROVIDERS` env (comma-separated Supabase slugs, e.g.
 * `google,github,azure`). Unset or empty means social sign-in is simply
 * not configured, which is the default : a deployment that hasn't
 * registered OAuth apps with the three vendors shows no buttons and
 * behaves exactly as it did before this feature existed.
 *
 * The env var names the providers whose credentials live in Supabase ;
 * it is not itself the credential store.
 */
export function configuredOAuthProviders(): OAuthProvider[] {
  const raw = process.env.AUTH_OAUTH_PROVIDERS ?? "";
  const seen = new Set<OAuthProvider>();
  for (const entry of raw.split(",")) {
    const slug = entry.trim().toLowerCase();
    if (isOAuthProvider(slug)) seen.add(slug);
  }
  return [...seen];
}
