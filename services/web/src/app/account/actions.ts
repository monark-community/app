"use server"

import sharp from "sharp"
import { createClient } from "@supabase/supabase-js"
import { setLocaleAction } from "@/i18n/set-locale-action"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"

export type ChangePasswordErrorCode =
  | "invalidCurrentPassword"
  | "weakPassword"
  | "upstream"

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; errorCode: ChangePasswordErrorCode }

// Requires current-password re-entry. Verification runs through a fresh,
// non-persisting Supabase client so the cookie-backed session on the SSR
// client isn't churned; on success, updateUser rotates the password on the
// real session.
export async function changePasswordAction(input: {
  currentPassword: string
  newPassword: string
}): Promise<ChangePasswordResult> {
  if (input.newPassword.length < 12) {
    return { ok: false, errorCode: "weakPassword" }
  }

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

  const { data: sessionData, error: updateError } = await supabase.auth.updateUser({
    password: input.newPassword,
  })
  if (updateError || !sessionData.user) {
    return { ok: false, errorCode: "upstream" }
  }

  const { data: refreshed } = await supabase.auth.getSession()
  const accessToken = refreshed.session?.access_token
  if (accessToken) {
    const api = createServerTrpcClient(accessToken)
    await api.auth.notifyPasswordChanged
      .mutate({ triggeredBy: "user" })
      .catch(() => {})
  }
  return { ok: true }
}

// Persists the user's locale preference AND writes the cookie so the next
// navigation renders in the new language without waiting for a full sign-out.
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
  await setLocaleAction(locale)
}

export type ChangeEmailErrorCode =
  | "invalidCurrentPassword"
  | "emailInUse"
  | "sameEmail"
  | "upstream"

export type ChangeEmailResult =
  | { ok: true }
  | { ok: false; errorCode: ChangeEmailErrorCode }

// Initiates the Supabase email-change flow; Supabase sends the confirmation
// email(s) and the link lands at /auth/confirm?type=email_change where our
// route mirrors the change into our User row + forces sign-out. Password
// re-entry guards against in-session account-takeover.
export async function requestEmailChangeAction(input: {
  currentPassword: string
  newEmail: string
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
