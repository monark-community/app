import { z } from "zod"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { router, publicProcedure } from "@monark/common/trpc"
import { UnauthorizedError } from "@monark/common"
import { getByEmail, getById } from "@monark/users/server"
import { checkPassword } from "./password"
import {
  markEmailVerified,
  recordResendAttempt,
  type ResendResult,
} from "./email-verification"
import { emitSignedIn, emitSignedOut } from "./events"
import { signUpUser, signUpInputSchema } from "./signup"

function authEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY!,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY!,
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
  }
}

export const authRouter = router({
  ping: publicProcedure.query(() => ({
    pong: true,
    at: new Date().toISOString(),
  })),

  session: publicProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
    activeOrganizationId: ctx.activeOrganizationId,
    signedIn: ctx.userId !== null,
  })),

  checkPassword: publicProcedure
    .input(
      z.object({
        password: z.string(),
        email: z.string().email().optional(),
        displayName: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      checkPassword(input.password, {
        email: input.email,
        displayName: input.displayName,
      }),
    ),

  // End-to-end signup. Creates the Supabase auth user (triggers confirmation
  // email) and mirrors into our `User` table. Callers then set the session
  // cookie via their own @supabase/ssr server client.
  signUp: publicProcedure
    .input(signUpInputSchema)
    .mutation(({ input }) => signUpUser(input, authEnv())),

  // Emits the domain event. Uses ctx.userId so a caller can't fake another
  // user's signin; the caller is expected to forward the freshly-issued
  // access token via the Authorization header.
  notifySignedIn: publicProcedure
    .input(
      z
        .object({
          trustedDeviceId: z.string().optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      await emitSignedIn({
        userId: ctx.userId,
        trustedDeviceId: input?.trustedDeviceId,
      })
    }),

  // Emits the signed-out event. Caller forwards the still-valid access token
  // so ctx.userId is populated; after this returns the caller clears cookies.
  notifySignedOut: publicProcedure
    .input(z.object({ scope: z.enum(["local", "global"]).default("local") }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      await emitSignedOut({ userId: ctx.userId, scope: input.scope })
    }),

  // Flips `User.emailVerifiedAt`. Expects the caller to have just finished
  // `verifyOtp` so ctx.userId points at the newly-verified user.
  markOwnEmailVerified: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    await markEmailVerified(ctx.userId)
  }),

  // Full resend flow: look up user, apply the rate limit, ask Supabase to send
  // a new confirmation email. Done server-side in one hop so the web layer
  // doesn't need to reach into our DB directly.
  requestConfirmationResend: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }): Promise<ResendActionResult> => {
      const user = await getByEmail(input.email)
      if (!user) {
        // Don't leak whether the email exists; pretend success.
        return { ok: true, remaining: 0 }
      }
      if (user.emailVerifiedAt) {
        return { ok: false, errorCode: "alreadyVerified" }
      }

      const limit: ResendResult = await recordResendAttempt(user.id)
      if (!limit.sent) {
        return {
          ok: false,
          errorCode: "exhausted",
          retryAfterSeconds: limit.retryAfterSeconds,
        }
      }

      const env = authEnv()
      const supabase: SupabaseClient = createClient(
        env.supabaseUrl,
        env.supabasePublishableKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: input.email,
        options: { emailRedirectTo: `${env.appUrl}/auth/confirm` },
      })
      if (resendError) {
        return { ok: false, errorCode: "upstream" }
      }

      return { ok: true, remaining: limit.remainingInWindow }
    }),
})

// Shape mirrors the previous server action so the web layer maps 1-to-1.
export type ResendActionErrorCode = "alreadyVerified" | "exhausted" | "upstream"
export type ResendActionResult =
  | { ok: true; remaining: number }
  | { ok: false; errorCode: ResendActionErrorCode; retryAfterSeconds?: number }

// Reusable helpers used by server actions in services/web + by any future
// server-side auth orchestration.
export { signUpUser, signUpInputSchema } from "./signup"
export type { SignUpInput, SignUpResult, SignUpDeps } from "./signup"
export { emitSignedIn, emitSignedOut, emitPasswordChanged } from "./events"
export { checkPassword } from "./password"
export {
  markEmailVerified,
  recordResendAttempt,
  requireVerifiedEmail,
  RESEND_MAX_PER_WINDOW,
  RESEND_WINDOW_MS,
  type ResendResult,
} from "./email-verification"

// Read interface. Takes an explicit ctx so callers can use this from either
// tRPC procedures or Next server components.
export async function getCurrentUser(ctx: { userId: string | null }) {
  if (!ctx.userId) return null
  return getById(ctx.userId)
}

export async function requireUser(ctx: { userId: string | null }) {
  if (!ctx.userId) throw new UnauthorizedError()
  const user = await getById(ctx.userId)
  if (!user) throw new UnauthorizedError()
  return user
}
