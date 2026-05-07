"use server"

import sharp from "sharp"
import { getRequestAppUrl } from "@/lib/request-app-url"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"

// Admin-side server actions for the `/admin/users/[id]` surface. Mirrors
// the self-service flows in `(authed)/account/actions.ts` but every action
// takes an explicit `targetUserId` and routes through the corresponding
// `users.admin*` / `auth.admin*` tRPC procedure (the rbac gate lives
// there, on the server). Avatar + banner uploads still process the image
// through `sharp` locally before handing the resulting URL to the admin
// update procedure.

export type AdminUploadAvatarErrorCode =
  | "invalidType"
  | "tooLarge"
  | "notAuthenticated"
  | "upstream"

export type AdminUploadAvatarResult =
  | { ok: true; avatarUrl: string }
  | { ok: false; errorCode: AdminUploadAvatarErrorCode }

const AVATAR_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_TARGET_PX = 512

// Uploads to the same `avatars` bucket the self-service flow uses, but
// under the *target* user's folder so the file's path is consistent
// regardless of who triggered the upload. RLS on the bucket allows
// admin-tier roles to write into any user folder ; the tRPC mutation
// below then mirrors the URL into the User row.
export async function adminUploadAvatarAction(
  formData: FormData,
): Promise<AdminUploadAvatarResult> {
  const file = formData.get("file")
  const targetUserId = formData.get("userId")
  if (typeof targetUserId !== "string" || !targetUserId) {
    return { ok: false, errorCode: "upstream" }
  }
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
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "notAuthenticated" }

  let processed: Buffer
  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer())
    processed = await sharp(inputBuffer)
      .rotate()
      .resize(AVATAR_TARGET_PX, AVATAR_TARGET_PX, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    return { ok: false, errorCode: "invalidType" }
  }

  const timestamp = Date.now()
  const path = `${targetUserId}/${timestamp}.webp`
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

  try {
    const api = createServerTrpcClient(accessToken)
    await api.users.adminUpdateProfile.mutate({ userId: targetUserId, avatarUrl })
  } catch {
    return { ok: false, errorCode: "upstream" }
  }
  return { ok: true, avatarUrl }
}

export type AdminUploadBannerErrorCode =
  | "invalidType"
  | "tooLarge"
  | "notAuthenticated"
  | "upstream"

export type AdminUploadBannerResult =
  | { ok: true; bannerUrl: string }
  | { ok: false; errorCode: AdminUploadBannerErrorCode }

const BANNER_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])
const BANNER_MAX_BYTES = 5 * 1024 * 1024
const BANNER_TARGET_WIDTH = 1500
const BANNER_TARGET_HEIGHT = 500

export async function adminUploadBannerAction(
  formData: FormData,
): Promise<AdminUploadBannerResult> {
  const file = formData.get("file")
  const targetUserId = formData.get("userId")
  if (typeof targetUserId !== "string" || !targetUserId) {
    return { ok: false, errorCode: "upstream" }
  }
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
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "notAuthenticated" }

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
  const path = `${targetUserId}/banners/${timestamp}.webp`
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

  try {
    const api = createServerTrpcClient(accessToken)
    await api.users.adminUpdateProfile.mutate({ userId: targetUserId, bannerUrl })
  } catch {
    return { ok: false, errorCode: "upstream" }
  }
  return { ok: true, bannerUrl }
}

export type AdminPasswordResetResult =
  | { ok: true }
  | { ok: false; errorCode: "notAuthenticated" | "forbidden" | "upstream" }

// Admin-initiated password reset. Triggers Supabase's standard
// `resetPasswordForEmail` against the target user's address ; the user
// receives the same email + link they would on a self-service forgot-
// password flow, lands on `/auth/reset-password`, and picks a new
// password themselves. We don't mutate the password directly so an
// admin can't lock the user out by silently rotating their credential ;
// the user is always in control of the actual new value.
//
// rbac is enforced server-side : we round-trip the request through the
// admin-gated tRPC `users.adminGetUser` first to confirm both that the
// caller is admin AND that the target user actually exists / isn't
// already anonymized. If that lookup throws (UNAUTHORIZED / FORBIDDEN /
// NOT_FOUND), we surface a clean error to the caller.
export async function adminSendPasswordResetAction(input: {
  userId: string
}): Promise<AdminPasswordResetResult> {
  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "notAuthenticated" }

  let email: string
  try {
    const api = createServerTrpcClient(accessToken)
    const result = await api.users.adminGetUser.query({ userId: input.userId })
    email = result.user.email
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "data" in error
        ? (error as { data?: { code?: string } }).data?.code
        : undefined
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
      return { ok: false, errorCode: "forbidden" }
    }
    return { ok: false, errorCode: "upstream" }
  }

  // Build the redirect URL from the request's actual Host header so a
  // user clicking the link from a LAN/preview deployment lands back on
  // the same host the admin triggered this from. The /auth/confirm
  // route forwards `recovery` tokens to /auth/reset-password.
  const appUrl = await getRequestAppUrl()
  await supabase.auth
    .resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/confirm?type=recovery`,
    })
    .catch(() => {
      // Same enumeration-resistance reasoning as the self-service
      // forgot-password flow ; we don't surface "didn't send" because
      // we already confirmed the user exists, the only reason this
      // can fail is upstream Supabase transport.
    })
  return { ok: true }
}
