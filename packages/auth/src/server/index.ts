import { z } from "zod"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { UAParser } from "ua-parser-js"
import { router, publicProcedure } from "@monark/common/trpc"
import { ForbiddenError, UnauthorizedError, ValidationError } from "@monark/common"
import { isEnabled } from "@monark/feature-flags/server"
import { adminAssignmentSummary } from "@monark/rbac/server"
import { getByEmail, getById } from "@monark/users/server"
import { hardDeleteUser } from "./account-lifecycle"
import { checkPassword } from "./password"
import {
  markEmailVerified,
  recordResendAttempt,
  type ResendResult,
} from "./email-verification"
import { emitPasswordChanged, emitSignedIn, emitSignedOut } from "./events"
import { signUpUser, signUpInputSchema } from "./signup"
import {
  findCurrentDeviceId,
  listTrustedDevices,
  recognizeOrRegister,
  revokeAllTrustedDevices,
  revokeTrustedDevice,
  type TrustedDeviceRow,
} from "./trusted-devices"
import {
  acknowledgeRecoveryCodeUse,
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  getRecoveryCodeStatus,
  getTotpStatus,
  regenerateRecoveryCodes,
  verifyRecoveryCode,
  verifyTotpCode,
  markDeviceTotpVerified,
  requiresTotpChallenge,
  adminTotpEnforcement,
} from "./totp"

// Exposed to clients; strips the cookie hash (treat it as a server secret).
//
// Browser / OS / device fields are all UAParser output, parsed once
// server-side and shipped as separate primitives so the client can format
// the device title in the user's locale (e.g. "Chrome on macOS" / "Chrome
// sur macOS") instead of relying on the English-only `label` we cached at
// insert time. `label` stays as the fallback when every parse field fails.
//
// `deviceVendor` + `deviceModel` are populated for most mobile devices
// (Android sends them in the UA, the parser maps the common Samsung /
// Pixel codes to friendly names) but are typically null on desktop.
// iOS strips model deliberately ; you'll see `deviceModel = "iPhone"`
// without a generation number and that's intentional Apple behaviour.
//
// `deviceType` follows ua-parser-js's enum: "mobile" | "tablet" |
// "console" | "smarttv" | "wearable" | "embedded" | "xr". Desktop
// browsers leave it null. The card uses it to pick the glyph (phone /
// tablet / laptop) without re-parsing the UA on the client.
export type TrustedDeviceView = Omit<TrustedDeviceRow, "cookieHash"> & {
  browserName: string | null
  osName: string | null
  deviceVendor: string | null
  deviceModel: string | null
  deviceType: string | null
}

function toView(row: TrustedDeviceRow): TrustedDeviceView {
  const { cookieHash: _cookieHash, ...rest } = row
  const parsed = row.userAgent ? new UAParser(row.userAgent).getResult() : null
  // UA-CH model is always preferred when present : on modern Chrome /
  // Edge for Android the UA string itself reduces the device model to
  // "K" for privacy, so the ua-parser-js result is essentially useless
  // there. The hint stored at recognize-time carries the real string
  // ("Pixel 7", "Galaxy S24", …). Falls back to the UA-parsed value
  // when no hints were captured (Firefox, Safari, older Chrome).
  const hints = (row.clientHints ?? null) as {
    model?: string
    platformVersion?: string
  } | null
  const uaModel = parsed?.device.model ?? null
  const reducedModel = uaModel === "K" || uaModel === null
  const deviceModel = hints?.model ?? (reducedModel ? null : uaModel)
  return {
    ...rest,
    browserName: parsed?.browser.name ?? null,
    osName: parsed?.os.name ?? null,
    deviceVendor: parsed?.device.vendor ?? null,
    deviceModel,
    deviceType: parsed?.device.type ?? null,
  }
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

  // Read surface for the post-sign-in reminder modal. Returns enrollment +
  // unacknowledged-use + remaining-codes counts so the client can pick
  // its mode (acknowledge / low quota / forced regen). Safe for anon.
  recoveryStatus: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) {
      return {
        enrolled: false,
        hasUnacknowledgedUse: false,
        lastUnacknowledgedUseAt: null,
        remainingCodes: 0,
      }
    }
    return getRecoveryCodeStatus(ctx.userId)
  }),

  // User confirmed they've struck the spent recovery code from their
  // saved list ; clears the unack flag so the modal stops reappearing.
  acknowledgeRecoveryUse: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    await acknowledgeRecoveryCodeUse(ctx.userId)
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

  // Read by /admin route guards + the /account banner. Returns enforcement
  // mode (soft/hard) when the signed-in admin must enroll TOTP.
  adminEnforcement: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return { required: false } as const
    return adminTotpEnforcement(ctx.userId)
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
        // ISO-3166-1 alpha-2 country code (e.g. "CA", "FR"). Read from
        // hosting-platform edge headers in the web layer ; null when
        // self-hosted without geo lookup or when the platform doesn't
        // resolve one.
        country: z.string().length(2).nullable().optional(),
        // High-entropy User-Agent Client Hints (`Sec-CH-UA-Model`,
        // `Sec-CH-UA-Platform-Version`, `Sec-CH-UA-Full-Version-List`)
        // captured in the web layer when the browser sends them.
        // Persisted as-is so `toView` can prefer the real model
        // ("Pixel 7") over the UA-reduced placeholder ("K") modern
        // Android Chrome serves up.
        clientHints: z
          .object({
            model: z.string().optional(),
            platformVersion: z.string().optional(),
            fullVersionList: z.string().optional(),
          })
          .nullable()
          .optional(),
        existingCookieValue: z.string().nullable().optional(),
        supabaseSessionId: z.string().nullable().optional(),
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
        country: input.country ?? null,
        clientHints: input.clientHints ?? null,
        existingCookieValue: input.existingCookieValue ?? null,
        supabaseSessionId: input.supabaseSessionId ?? null,
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

  // Emergency lockout. Revokes every non-revoked device the user owns ; each
  // row's per-device Supabase admin signOut runs server-side. The caller's
  // own Supabase cookie still has to be cleared by the web action that
  // invoked this mutation. Returns the count of devices revoked so the UI
  // can confirm "N sessions ended".
  revokeAll: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    const count = await revokeAllTrustedDevices({ userId: ctx.userId })
    return { count }
  }),

  // Resolves the device id matching the caller-supplied cookie. Read by
  // /account server-side so the trusted-devices list can light up the "this
  // device" pill ; cookie value is hashed server-side so it never leaks
  // into client memory.
  currentDeviceId: publicProcedure
    .input(z.object({ cookieValue: z.string().nullable().optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) return null
      return findCurrentDeviceId({
        userId: ctx.userId,
        cookieValue: input?.cookieValue ?? null,
      })
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
  // `appUrl` (optional) overrides the env-baked default so the email
  // confirmation link points back to the host the user actually signed
  // up from (matters for LAN testing + preview deployments where the
  // boot-time `APP_URL` doesn't match the request origin). The web
  // server action reads it from the request Host header.
  signUp: publicProcedure
    .input(signUpInputSchema.extend({ appUrl: z.string().url().optional() }))
    .mutation(({ input }) => {
      const { appUrl, ...rest } = input
      const env = authEnv()
      return signUpUser(rest, { ...env, appUrl: appUrl ?? env.appUrl })
    }),

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
  //
  // `appUrl` (optional) is the host the user actually saw when they
  // requested the resend ; the web action reads it from the request
  // Host header so the link in the email lands on the same device the
  // user is on (esp. for LAN testing where `process.env.APP_URL` is
  // baked at boot to localhost). Falls back to the env value when
  // unspecified.
  requestConfirmationResend: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        appUrl: z.string().url().optional(),
      }),
    )
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
      const appUrl = input.appUrl ?? env.appUrl
      const supabase: SupabaseClient = createClient(
        env.supabaseUrl,
        env.supabasePublishableKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: input.email,
        options: { emailRedirectTo: `${appUrl}/auth/confirm` },
      })
      if (resendError) {
        return { ok: false, errorCode: "upstream" }
      }

      return { ok: true, remaining: limit.remainingInWindow }
    }),

  // Admin-only hard delete. Bypasses the standard 14-day grace window —
  // the user row is anonymized, the Supabase auth row is removed, and the
  // `user.deleted` event is emitted in one shot. Lives in the auth router
  // (not users) because Supabase admin teardown is auth's domain ; the
  // soft-delete + grace-period flow stays in the users router. Caller
  // can't target their own account via this surface ; if an admin wants
  // to delete themselves they go through `/account` like any other user.
  adminHardDeleteUser: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const summary = await adminAssignmentSummary(ctx.userId)
      if (!summary.hasAdmin) throw new ForbiddenError("Admin role required.")
      if (input.userId === ctx.userId) {
        throw new ValidationError(
          "Use your own account page to delete your account.",
        )
      }
      await hardDeleteUser(input.userId)
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
  findCurrentDeviceId,
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
  adminTotpEnforcement,
  cleanupStaleTotpEnrollments,
  TotpRateLimitError,
  type TotpStatus,
  type AdminTotpEnforcement,
} from "./totp"
export { hardDeleteUser, processExpiredDeletions } from "./account-lifecycle"
export { getSupabaseAdmin } from "./supabase-admin"
export { registerAuthFeatureFlags } from "./flags"
export { registerAuthEventTypes } from "./event-types"

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
