import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { emit, logger, ConflictError, ValidationError } from "@monark/common";
import { getDb } from "@monark/db";
import type { UserSignedUpEvent } from "../contracts/events";
import { checkPassword } from "./password";

export const signUpInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().min(1).max(80).optional(),
  referralCode: z.string().optional(),
  // IETF tag (`en`, `fr`). Caller passes whatever the browser's
  // Accept-Language header resolves to; we fall back to `en` if unsupported.
  localePreference: z.enum(["en", "fr"]).optional(),
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;

export type SignUpResult = {
  userId: string;
  email: string;
  needsEmailVerification: boolean;
};

export type SignUpDeps = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseSecretKey: string;
  appUrl: string;
};

// Creates a Supabase Auth user via the public `auth.signUp` path (which triggers
// the verification email through Supabase's SMTP; Mailpit catches it locally)
// then mirrors the user into our own `User` table with `emailVerifiedAt: null`.
// `/auth/confirm` flips `emailVerifiedAt` once the recipient clicks the link.
//
// Compensating transaction: if the DB insert throws, we delete the Supabase
// user via the admin client so we don't leave orphans.
export async function signUpUser(input: SignUpInput, deps: SignUpDeps): Promise<SignUpResult> {
  const parsed = signUpInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid signup input", parsed.error.flatten());
  }

  const strength = await checkPassword(parsed.data.password, {
    email: parsed.data.email,
    displayName: parsed.data.displayName,
  });
  if (!strength.ok) {
    // Deliberately generic client-facing message; the specific reasons are
    // logged for debugging but never returned to the client.
    logger.info({ reasons: strength.reasons }, "signup rejected by password check");
    throw new ValidationError("Please choose a stronger password.");
  }

  const publicClient: SupabaseClient = createClient(deps.supabaseUrl, deps.supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Stash display name + locale into Supabase user_metadata so the email
  // template can render the user's preferred language (`{{ .Data.locale_preference }}`)
  // and personalise the greeting (`{{ .Data.display_name }}`). Locale falls
  // back to "en" inside the template when the field is absent.
  const userMetadata: Record<string, string> = {};
  if (parsed.data.displayName) userMetadata.display_name = parsed.data.displayName;
  if (parsed.data.localePreference) {
    userMetadata.locale_preference = parsed.data.localePreference;
  }

  const signUp = await publicClient.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${deps.appUrl}/auth/confirm`,
      data: Object.keys(userMetadata).length > 0 ? userMetadata : undefined,
    },
  });

  if (signUp.error || !signUp.data.user) {
    if (signUp.error?.status === 422 || signUp.error?.code === "user_already_exists") {
      throw new ConflictError("An account with that email already exists.");
    }
    throw new Error(signUp.error?.message ?? "Failed to create auth user");
  }

  const authUser = signUp.data.user;
  const db = getDb();
  const alreadyVerified =
    typeof authUser.email_confirmed_at === "string" && authUser.email_confirmed_at !== "";

  try {
    await db.user.create({
      data: {
        id: authUser.id,
        email: parsed.data.email,
        emailVerifiedAt: alreadyVerified ? new Date(authUser.email_confirmed_at!) : null,
        displayName: parsed.data.displayName ?? null,
        // Schema default is "en"; only override when the caller passed a
        // supported tag picked from Accept-Language so we don't accidentally
        // store something unsupported.
        ...(parsed.data.localePreference ? { localePreference: parsed.data.localePreference } : {}),
      },
    });
  } catch (error) {
    logger.error(
      { err: error, userId: authUser.id },
      "signup db insert failed; rolling back auth user",
    );
    const adminClient: SupabaseClient = createClient(deps.supabaseUrl, deps.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await adminClient.auth.admin.deleteUser(authUser.id).catch((cleanup) => {
      logger.error({ err: cleanup, userId: authUser.id }, "rollback failed; orphan auth user");
    });
    throw new Error("Signup failed.");
  }

  const event: UserSignedUpEvent = {
    type: "user.signed-up",
    userId: authUser.id,
    email: parsed.data.email,
    referralCode: parsed.data.referralCode,
    occurredAt: new Date(),
  };
  await emit(event);

  return {
    userId: authUser.id,
    email: parsed.data.email,
    needsEmailVerification: !alreadyVerified,
  };
}
