"use server"

import sharp from "sharp"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { setLocaleAction } from "@/i18n/set-locale-action"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"
import { DEVICE_COOKIE_NAME } from "@/lib/trusted-device-cookie"

export type ChangePasswordErrorCode =
  | "invalidCurrentPassword"
  | "weakPassword"
  | "totpRequired"
  | "invalidTotpCode"
  | "upstream"

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; errorCode: ChangePasswordErrorCode }

// Requires current-password re-entry plus, when the user has TOTP
// enrolled, a fresh authenticator code. Verification runs through a
// fresh, non-persisting Supabase client so the cookie-backed session on
// the SSR client isn't churned; on success, updateUser rotates the
// password on the real session.
//
// Strength enforcement runs through `auth.checkPassword` (the same path
// signup uses) so the rules stay in sync: minLength, char-class mix,
// "doesn't contain email / displayName", HIBP breach check. The client
// surfaces the per-rule hints + strength meter live ; the server is the
// authoritative gate.
//
// TOTP gate: defense-in-depth on top of the current-password check.
// Without it, an attacker holding a live session could rotate the
// password and lock the legitimate user out before they noticed. The
// user-facing form pulls `auth.totp.status` to decide whether to show
// the code field, but the server is the authority — a request that
// somehow arrives without a code while TOTP is enrolled is rejected
// with `totpRequired`.
export async function changePasswordAction(input: {
  currentPassword: string
  newPassword: string
  totpCode?: string
}): Promise<ChangePasswordResult> {
  const supabase = await createSupabaseServerClient()
  const { data: userData } = await supabase.auth.getUser()
  const email = userData.user?.email
  if (!email) {
    return { ok: false, errorCode: "upstream" }
  }

  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const verify = await verifier.auth.signInWithPassword({
    email,
    password: input.currentPassword,
  })
  if (verify.error) {
    return { ok: false, errorCode: "invalidCurrentPassword" }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "upstream" }
  const api = createServerTrpcClient(accessToken)

  // Branch on TOTP enrollment ; non-enrolled users skip the code prompt
  // entirely (current password + strength rules are the only gate).
  const totpStatus = await api.auth.totp.status.query().catch(() => null)
  if (totpStatus && "enrolled" in totpStatus && totpStatus.enrolled) {
    if (!input.totpCode || input.totpCode.length < 6) {
      return { ok: false, errorCode: "totpRequired" }
    }
    const verified = await api.auth.totp.verifyCode
      .mutate({ code: input.totpCode })
      .catch(() => ({ ok: false }))
    if (!verified.ok) {
      return { ok: false, errorCode: "invalidTotpCode" }
    }
  }

  const me = await api.users.me.query().catch(() => null)
  const strength = await api.auth.checkPassword
    .mutate({
      password: input.newPassword,
      email,
      displayName: me?.displayName ?? undefined,
    })
    .catch(() => null)
  if (!strength || !strength.ok) {
    return { ok: false, errorCode: "weakPassword" }
  }

  const { data: updated, error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  })
  if (updateError || !updated.user) {
    return { ok: false, errorCode: "upstream" }
  }

  await api.auth.notifyPasswordChanged
    .mutate({ triggeredBy: "user" })
    .catch(() => {})
  return { ok: true }
}

// Persists the user's locale preference AND writes the cookie so the next
// navigation renders in the new language without waiting for a full sign-out.
// Also mirrors the locale into Supabase `user_metadata.locale_preference`
// so transactional emails (signup confirm, email change) Supabase sends on
// our behalf can branch the template on the current preference instead of
// the one frozen at signup.
export async function updateLocaleAction(locale: "en" | "fr"): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (accessToken) {
    const api = createServerTrpcClient(accessToken)
    await api.users.updateProfile
      .mutate({ localePreference: locale })
      .catch(() => {})
  }
  await supabase.auth
    .updateUser({ data: { locale_preference: locale } })
    .catch(() => {})
  await setLocaleAction(locale)
}

export type ChangeEmailErrorCode =
  | "invalidCurrentPassword"
  | "emailInUse"
  | "sameEmail"
  | "totpRequired"
  | "invalidTotpCode"
  | "upstream"

export type ChangeEmailResult =
  | { ok: true }
  | { ok: false; errorCode: ChangeEmailErrorCode }

// Initiates the Supabase email-change flow ; Supabase sends the
// confirmation email(s) and the link lands at /auth/confirm?type=email_change
// where our route mirrors the change into our User row + forces sign-out.
// Password re-entry guards against in-session account-takeover ; the TOTP
// gate (when the user is enrolled) layers a second factor on top so an
// attacker holding a session AND the password can't pivot the account's
// recovery email without the authenticator. The user-facing form only
// renders the TOTP field when status.enrolled is true ; the server is
// the authoritative gate and rejects with `totpRequired` if the code is
// missing despite enrollment.
export async function requestEmailChangeAction(input: {
  currentPassword: string
  newEmail: string
  totpCode?: string
}): Promise<ChangeEmailResult> {
  const normalized = input.newEmail.trim().toLowerCase()
  if (!normalized || !normalized.includes("@")) {
    return { ok: false, errorCode: "upstream" }
  }

  const supabase = await createSupabaseServerClient()
  const { data: userData } = await supabase.auth.getUser()
  const email = userData.user?.email
  if (!email) {
    return { ok: false, errorCode: "upstream" }
  }
  if (email.toLowerCase() === normalized) {
    return { ok: false, errorCode: "sameEmail" }
  }

  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const verify = await verifier.auth.signInWithPassword({
    email,
    password: input.currentPassword,
  })
  if (verify.error) {
    return { ok: false, errorCode: "invalidCurrentPassword" }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "upstream" }
  const api = createServerTrpcClient(accessToken)

  const totpStatus = await api.auth.totp.status.query().catch(() => null)
  if (totpStatus && "enrolled" in totpStatus && totpStatus.enrolled) {
    if (!input.totpCode || input.totpCode.length < 6) {
      return { ok: false, errorCode: "totpRequired" }
    }
    const verified = await api.auth.totp.verifyCode
      .mutate({ code: input.totpCode })
      .catch(() => ({ ok: false }))
    if (!verified.ok) {
      return { ok: false, errorCode: "invalidTotpCode" }
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    email: normalized,
  })
  if (updateError) {
    const code = updateError.code ?? ""
    if (code === "email_exists" || code === "email_address_invalid") {
      return { ok: false, errorCode: "emailInUse" }
    }
    return { ok: false, errorCode: "upstream" }
  }
  return { ok: true }
}

export type VerifyEmailChangeOtpErrorCode =
  | "missing"
  | "invalidCode"
  | "notAuthenticated"
  | "upstream"

export type VerifyEmailChangeOtpResult =
  | { ok: true; pendingOtherSide: boolean; rotated: boolean }
  | { ok: false; errorCode: VerifyEmailChangeOtpErrorCode }

// Manual-entry path for the 6-digit code Supabase puts in the
// email-change confirmation emails. Mirror of the link path : both
// sides (old + new addresses) must confirm before Supabase rotates
// `auth.users.email`. The user can enter either OTP here ; we try
// the new address first (more common, the user opens the brand-new
// inbox first to grab the code), then the old address.
//
// On success we mirror the /auth/confirm route handler's email-change
// branch : if the rotation completed, sync our shadow row + force
// sign-out so the user re-authenticates with the new address. If only
// one side confirmed, leave the session intact and return
// `pendingOtherSide: true` so the UI can prompt for the second code.
export async function verifyEmailChangeOtpAction(input: {
  newEmail: string
  token: string
}): Promise<VerifyEmailChangeOtpResult> {
  const token = input.token?.trim()
  const newEmail = input.newEmail?.trim().toLowerCase()
  if (!token || !newEmail) {
    return { ok: false, errorCode: "missing" }
  }

  const supabase = await createSupabaseServerClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user || !userData.user.email) {
    return { ok: false, errorCode: "notAuthenticated" }
  }
  const oldEmail = userData.user.email.toLowerCase()

  // Try the new address first ; that's the inbox the user just got an
  // unfamiliar account-confirmation email in, so it's where they're
  // most likely to open the email and grab the code from.
  let verified = await supabase.auth.verifyOtp({
    type: "email_change",
    token,
    email: newEmail,
  })
  if (verified.error && oldEmail !== newEmail) {
    verified = await supabase.auth.verifyOtp({
      type: "email_change",
      token,
      email: oldEmail,
    })
  }
  if (verified.error || !verified.data.user) {
    return { ok: false, errorCode: "invalidCode" }
  }

  // After a successful verify, `verified.data.user.email` reflects the
  // current state on the auth row : if it's already the new address,
  // both sides are confirmed and the rotation completed. Otherwise the
  // change is still pending the other inbox.
  const rotated =
    verified.data.user.email?.toLowerCase() === newEmail
  if (!rotated) {
    return { ok: true, pendingOtherSide: true, rotated: false }
  }

  // Same finalisation the link-click path runs : mirror to our shadow
  // row then sign out so the user re-authenticates with the new
  // address.
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (accessToken) {
    const api = createServerTrpcClient(accessToken)
    await api.users.syncEmail.mutate({ email: newEmail }).catch(() => {})
  }
  await supabase.auth.signOut({ scope: "local" })
  return { ok: true, pendingOtherSide: false, rotated: true }
}

export type DeleteAccountErrorCode =
  | "invalidConfirmation"
  | "notAuthenticated"
  | "upstream"

export type DeleteAccountResult =
  | { ok: true; deletionCompletesAt: string }
  | { ok: false; errorCode: DeleteAccountErrorCode }

// Stamps `deletedAt = now` on the User row (14-day grace), emits
// `user.deletion-requested`, then signs the user out locally. The hard
// delete (anonymization + Supabase admin delete) is a separate cron that
// runs after the grace window; it's not wired in this MVP. The user can
// cancel with `cancelAccountDeletionAction` any time before the window
// elapses.
export async function requestAccountDeletionAction(input: {
  emailConfirmation: string
}): Promise<DeleteAccountResult> {
  const supabase = await createSupabaseServerClient()
  const { data: userData } = await supabase.auth.getUser()
  const email = userData.user?.email
  if (!email) return { ok: false, errorCode: "notAuthenticated" }

  if (input.emailConfirmation.trim().toLowerCase() !== email.toLowerCase()) {
    return { ok: false, errorCode: "invalidConfirmation" }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "notAuthenticated" }

  let deletionCompletesAt: Date
  try {
    const api = createServerTrpcClient(accessToken)
    const result = await api.users.requestAccountDeletion.mutate()
    deletionCompletesAt = new Date(result.deletionCompletesAt)
  } catch {
    return { ok: false, errorCode: "upstream" }
  }

  await supabase.auth.signOut({ scope: "local" })
  return {
    ok: true,
    deletionCompletesAt: deletionCompletesAt.toISOString(),
  }
}

// Reverses `requestAccountDeletionAction` while the user is still in the
// grace window; also re-signs the user in is NOT needed since we only sign
// them out after requestDeletion (cancellation happens on /account while
// still authed).
export async function cancelAccountDeletionAction(): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false }
  try {
    const api = createServerTrpcClient(accessToken)
    await api.users.cancelAccountDeletion.mutate()
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export type UploadAvatarErrorCode =
  | "invalidType"
  | "tooLarge"
  | "notAuthenticated"
  | "upstream"

export type UploadAvatarResult =
  | { ok: true; avatarUrl: string }
  | { ok: false; errorCode: UploadAvatarErrorCode }

const AVATAR_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
// Square crop + downscale; 512px matches the spec and keeps Storage costs
// bounded regardless of what the user uploads.
const AVATAR_TARGET_PX = 512

// Uploads the picked File to the `avatars` bucket under the user's folder.
// Writes go through the cookie-authenticated SSR Supabase client, which RLS
// scopes to `avatars/<auth.uid()>/*` ; no admin key is ever reached for. The
// image is normalized server-side (1:1 cover crop, 512px, WebP at q80) so
// every avatar in Storage has a uniform shape. The returned URL carries a
// `?v=<timestamp>` so the browser doesn't serve a stale cached copy when
// the user replaces their avatar.
export async function uploadAvatarAction(formData: FormData): Promise<UploadAvatarResult> {
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { ok: false, errorCode: "invalidType" }
  }
  if (!AVATAR_ALLOWED_MIME.has(file.type)) {
    return { ok: false, errorCode: "invalidType" }
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, errorCode: "tooLarge" }
  }

  const supabase = await createSupabaseServerClient()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, errorCode: "notAuthenticated" }

  let processed: Buffer
  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer())
    processed = await sharp(inputBuffer)
      .rotate() // honors EXIF orientation; without this iPhone uploads land sideways
      .resize(AVATAR_TARGET_PX, AVATAR_TARGET_PX, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    return { ok: false, errorCode: "invalidType" }
  }

  const timestamp = Date.now()
  const path = `${userId}/${timestamp}.webp`
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, processed, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false,
    })
  if (uploadError) {
    return { ok: false, errorCode: "upstream" }
  }

  const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path)
  const avatarUrl = `${publicData.publicUrl}?v=${timestamp}`

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "notAuthenticated" }
  const api = createServerTrpcClient(accessToken)
  try {
    await api.users.updateProfile.mutate({ avatarUrl })
  } catch {
    return { ok: false, errorCode: "upstream" }
  }
  return { ok: true, avatarUrl }
}

// Clears the user's avatar. We only null the DB field for MVP; the orphaned
// Storage blob is cleaned up in a later pass (Storage cruft hasn't mattered
// at current scale).
export async function removeAvatarAction(): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false }
  const api = createServerTrpcClient(accessToken)
  try {
    await api.users.updateProfile.mutate({ avatarUrl: null })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export type UploadBannerErrorCode =
  | "invalidType"
  | "tooLarge"
  | "notAuthenticated"
  | "upstream"

export type UploadBannerResult =
  | { ok: true; bannerUrl: string }
  | { ok: false; errorCode: UploadBannerErrorCode }

const BANNER_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])
// Banners are full-bleed cover images, so we accept a larger raw upload than
// avatars; sharp compresses to well under the bucket's 2 MiB cap.
const BANNER_MAX_BYTES = 5 * 1024 * 1024
// 3:1 cover ratio at 1500x500 ; matches Twitter cover dimensions and renders
// crisply on retina displays without burning Storage.
const BANNER_TARGET_WIDTH = 1500
const BANNER_TARGET_HEIGHT = 500

// Same bucket as avatars (keeping a single set of RLS policies). Banners
// live under `<userId>/banners/<ts>.webp` so the RLS folder[1] check still
// resolves to the user's auth uid.
export async function uploadBannerAction(formData: FormData): Promise<UploadBannerResult> {
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { ok: false, errorCode: "invalidType" }
  }
  if (!BANNER_ALLOWED_MIME.has(file.type)) {
    return { ok: false, errorCode: "invalidType" }
  }
  if (file.size > BANNER_MAX_BYTES) {
    return { ok: false, errorCode: "tooLarge" }
  }

  const supabase = await createSupabaseServerClient()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return { ok: false, errorCode: "notAuthenticated" }

  let processed: Buffer
  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer())
    processed = await sharp(inputBuffer)
      .rotate()
      .resize(BANNER_TARGET_WIDTH, BANNER_TARGET_HEIGHT, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    return { ok: false, errorCode: "invalidType" }
  }

  const timestamp = Date.now()
  const path = `${userId}/banners/${timestamp}.webp`
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, processed, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false,
    })
  if (uploadError) {
    return { ok: false, errorCode: "upstream" }
  }

  const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path)
  const bannerUrl = `${publicData.publicUrl}?v=${timestamp}`

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "notAuthenticated" }
  const api = createServerTrpcClient(accessToken)
  try {
    await api.users.updateProfile.mutate({ bannerUrl })
  } catch {
    return { ok: false, errorCode: "upstream" }
  }
  return { ok: true, bannerUrl }
}

export async function removeBannerAction(): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false }
  const api = createServerTrpcClient(accessToken)
  try {
    await api.users.updateProfile.mutate({ bannerUrl: null })
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// Resolves the current device id for client surfaces that need to highlight
// "this device" in a list (the dev-overlay panel, mainly ; /account does
// the same lookup directly in its server component). The cookie is HttpOnly
// so the client can't read it directly ; this action reads it server-side
// and calls the existing tRPC query that hashes the cookie + matches it
// against the user's trusted-device rows.
export async function currentDeviceIdAction(): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return null
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null
  if (!cookieValue) return null
  const api = createServerTrpcClient(accessToken)
  return api.auth.trustedDevices.currentDeviceId
    .query({ cookieValue })
    .catch(() => null)
}

// Revokes a single trusted device the user owns and signs the local Supabase
// session out. Used by the trusted-devices section's confirm dialog when the
// user revokes the device matching `currentDeviceId` ; without the explicit
// local sign-out the user's cookie would stay valid until token refresh.
//
// On success the caller redirects to /signin client-side ; we don't redirect
// here because the client needs to clear React Query caches first.
export async function revokeCurrentDeviceAndSignOutAction(input: {
  deviceId: string
}): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false }
  try {
    const api = createServerTrpcClient(accessToken)
    await api.auth.trustedDevices.revoke.mutate({ deviceId: input.deviceId })
  } catch {
    return { ok: false }
  }
  // Clear the device cookie too ; the row is gone, the cookie value is
  // now meaningless and would only confuse the next sign-in's recognize().
  const cookieStore = await cookies()
  cookieStore.delete(DEVICE_COOKIE_NAME)
  await supabase.auth.signOut({ scope: "local" })
  return { ok: true }
}

// Emergency lockout. Revokes every non-revoked trusted device for the user,
// per-device admin signOut runs server-side, then the local Supabase cookie
// is cleared. After this returns successfully every browser the user was
// signed in on will see their session terminated on next token refresh.
export async function revokeAllAndSignOutAction(): Promise<{
  ok: boolean
  count?: number
}> {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false }
  let count = 0
  try {
    const api = createServerTrpcClient(accessToken)
    const result = await api.auth.trustedDevices.revokeAll.mutate()
    count = result.count
  } catch {
    return { ok: false }
  }
  const cookieStore = await cookies()
  cookieStore.delete(DEVICE_COOKIE_NAME)
  await supabase.auth.signOut({ scope: "local" })
  return { ok: true, count }
}
