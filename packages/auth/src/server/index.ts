import { z } from "zod"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { router, publicProcedure } from "@monark/common/trpc"
import { UnauthorizedError } from "@monark/common"
import { isEnabled } from "@monark/feature-flags/server"
import { getByEmail, getById } from "@monark/users/server"
import { checkPassword } from "./password"
import {
  markEmailVerified,
  recordResendAttempt,
  type ResendResult,
} from "./email-verification"
import { emitPasswordChanged, emitSignedIn, emitSignedOut } from "./events"
import { signUpUser, signUpInputSchema } from "./signup"
import {
  listTrustedDevices,
  recognizeOrRegister,
  revokeTrustedDevice,
  type TrustedDeviceRow,
} from "./trusted-devices"
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  getTotpStatus,
  regenerateRecoveryCodes,
  verifyRecoveryCode,
  verifyTotpCode,
  markDeviceTotpVerified,
  requiresTotpChallenge,
} from "./totp"

// Exposed to clients; strips the cookie hash (treat it as a server secret).
export type TrustedDeviceView = Omit<TrustedDeviceRow, "cookieHash">

function toView(row: TrustedDeviceRow): TrustedDeviceView {
  const { cookieHash: _cookieHash, ...rest } = row
  return rest
}

function authEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY!,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY!,
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
  }
}

const totpRouter = router({
  // Status is safe to expose unauthenticated (returns "not enrolled" for
  // anon) so the client can render the settings surface without auth noise.
  status: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return { enrolled: false } as const
    return getTotpStatus(ctx.userId)
  }),

  beginEnrollment: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    const user = await getById(ctx.userId)
    if (!user) throw new UnauthorizedError()
    return beginTotpEnrollment({ userId: ctx.userId, accountLabel: user.email })
  }),

  confirmEnrollment: publicProcedure
    .input(z.object({ code: z.string().min(6).max(8) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      return confirmTotpEnrollment({ userId: ctx.userId, code: input.code })
    }),

  // Called from the /signin/totp server action. Stamps the current device as
  // TOTP-verified so the user isn't challenged again on this device.
  verifyCode: publicProcedure
    .input(
      z.object({
        code: z.string().min(6).max(8),
        trustedDeviceId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const ok = await verifyTotpCode({ userId: ctx.userId, code: input.code })
      if (ok && input.trustedDeviceId) {
        await markDeviceTotpVerified({
          userId: ctx.userId,
          trustedDeviceId: input.trustedDeviceId,
        })
      }
      return { ok }
    }),

  // Same as verifyCode but consumes a recovery code; also stamps the device.
  verifyRecoveryCode: publicProcedure
    .input(
      z.object({
        code: z.string().min(8).max(20),
        trustedDeviceId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const ok = await verifyRecoveryCode({ userId: ctx.userId, code: input.code })
      if (ok && input.trustedDeviceId) {
        await markDeviceTotpVerified({
          userId: ctx.userId,
          trustedDeviceId: input.trustedDeviceId,
        })
      }
      return { ok }
    }),

  regenerateRecoveryCodes: publicProcedure
    .input(z.object({ code: z.string().min(6).max(8) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const recoveryCodes = await regenerateRecoveryCodes({
        userId: ctx.userId,
        code: input.code,
      })
      return { recoveryCodes }
    }),

  disable: publicProcedure
    .input(z.object({ code: z.string().min(6).max(8) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      await disableTotp({ userId: ctx.userId, code: input.code })
    }),

  // Called from the sign-in flow to decide whether to route to /signin/totp.
  isChallengeRequired: publicProcedure
    .input(
      z.object({ trustedDeviceId: z.string().nullable().optional() }).optional(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) return false
      return requiresTotpChallenge({
        userId: ctx.userId,
        trustedDeviceId: input?.trustedDeviceId ?? null,
      })
    }),
})

const trustedDevicesRouter = router({
  // Non-revoked devices for the signed-in user.
  mine: publicProcedure.query(async ({ ctx }): Promise<TrustedDeviceView[]> => {
    if (!ctx.userId) return []
    const rows = await listTrustedDevices(ctx.userId)
    return rows.map(toView)
  }),

  // Called by the web server action right after a successful sign-in / verify.
  // Returns a fresh cookie value when the current one didn't match any live
  // device record; the caller is responsible for writing the cookie.
  // Gated by the `auth.trusted-devices` flag so operators can kill the flow
  // without a redeploy if tracking ever misbehaves.
  recognize: publicProcedure
    .input(
      z.object({
        userAgent: z.string().nullable().optional(),
        ip: z.string().nullable().optional(),
        existingCookieValue: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const flagOn = await isEnabled("auth.trusted-devices", { userId: ctx.userId })
      if (!flagOn) {
        return { deviceId: null, isNew: false, rawCookieValue: null }
      }
      const result = await recognizeOrRegister({
        userId: ctx.userId,
        userAgent: input.userAgent ?? null,
        ip: input.ip ?? null,
        existingCookieValue: input.existingCookieValue ?? null,
      })
      return {
        deviceId: result.device.id,
        isNew: result.isNew,
        rawCookieValue: result.rawCookieValue,
      }
    }),

  // Soft-revokes a device the user owns; no-op if it doesn't belong to them or
  // is already revoked.
  revoke: publicProcedure
    .input(z.object({ deviceId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      await revokeTrustedDevice({ userId: ctx.userId, deviceId: input.deviceId })
    }),
})

export const authRouter = router({
  trustedDevices: trustedDevicesRouter,
  totp: totpRouter,

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

  // Emits `user.password-changed`. Supabase owns the actual password state;
  // this is just the domain event so downstream listeners (security logs,
  // notification emails) can react.
  notifyPasswordChanged: publicProcedure
    .input(z.object({ triggeredBy: z.enum(["user", "reset"]).default("user") }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      await emitPasswordChanged({ userId: ctx.userId, triggeredBy: input.triggeredBy })
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
export {
  recognizeOrRegister,
  listTrustedDevices,
  revokeTrustedDevice,
  DEVICE_COOKIE_NAME,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  type TrustedDeviceRow,
} from "./trusted-devices"
export {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  verifyTotpCode,
  verifyRecoveryCode,
  regenerateRecoveryCodes,
  disableTotp,
  getTotpStatus,
  isTotpActive,
  requiresTotpChallenge,
  markDeviceTotpVerified,
  type TotpStatus,
} from "./totp"

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
