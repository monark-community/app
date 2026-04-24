import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { emit, logger, ConflictError, ValidationError } from "@monark/common"
import { getDb } from "@monark/db"
import type { UserSignedUpEvent } from "../contracts/events"

export const signUpInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().min(1).max(80).optional(),
  referralCode: z.string().optional(),
})

export type SignUpInput = z.infer<typeof signUpInputSchema>

export type SignUpResult = {
  userId: string
  email: string
}

export type SignUpDeps = {
  supabaseUrl: string
  supabaseSecretKey: string
}

// Creates a Supabase Auth user + shadow `User` row in a compensating transaction.
// If the DB insert fails, the Supabase user is deleted so we don't leave an
// orphan account that nobody can ever clean up.
export async function signUpUser(
  input: SignUpInput,
  deps: SignUpDeps,
): Promise<SignUpResult> {
  const parsed = signUpInputSchema.safeParse(input)
  if (!parsed.success) {
    throw new ValidationError("Invalid signup input", parsed.error.flatten())
  }

  const admin: SupabaseClient = createClient(deps.supabaseUrl, deps.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const created = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: parsed.data.displayName
      ? { display_name: parsed.data.displayName }
      : undefined,
  })

  if (created.error || !created.data.user) {
    if (created.error?.status === 422 || created.error?.code === "email_exists") {
      throw new ConflictError("An account with that email already exists.")
    }
    throw new Error(created.error?.message ?? "Failed to create auth user")
  }

  const authUser = created.data.user
  const db = getDb()

  try {
    await db.user.create({
      data: {
        id: authUser.id,
        email: parsed.data.email,
        emailVerifiedAt: new Date(),
        displayName: parsed.data.displayName ?? null,
      },
    })
  } catch (error) {
    logger.error({ err: error, userId: authUser.id }, "signup db insert failed; rolling back auth user")
    await admin.auth.admin.deleteUser(authUser.id).catch((cleanup) => {
      logger.error({ err: cleanup, userId: authUser.id }, "rollback failed; orphan auth user")
    })
    throw new Error("Signup failed.")
  }

  const event: UserSignedUpEvent = {
    type: "user.signed-up",
    userId: authUser.id,
    email: parsed.data.email,
    referralCode: parsed.data.referralCode,
    occurredAt: new Date(),
  }
  await emit(event)

  return { userId: authUser.id, email: parsed.data.email }
}
