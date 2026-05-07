"use server"

import sharp from "sharp"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createServerTrpcClient } from "@/lib/trpc-server"

export type AdminUploadOrgLogoErrorCode =
  | "invalidType"
  | "tooLarge"
  | "notAuthenticated"
  | "forbidden"
  | "upstream"

export type AdminUploadOrgLogoResult =
  | { ok: true; logoUrl: string }
  | { ok: false; errorCode: AdminUploadOrgLogoErrorCode }

const LOGO_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])
const LOGO_MAX_BYTES = 2 * 1024 * 1024
// Square downscale to 512px ; same surface as the user-avatar pipeline so
// every org logo in Storage has a uniform shape regardless of what the
// admin uploaded.
const LOGO_TARGET_PX = 512

// Logo uploads land in the same `avatars` bucket the user-avatars use ;
// avoids a second bucket + RLS policy set for what is functionally the
// same primitive. The path is `org-logos/<orgId>/<ts>.webp`.
//
// RLS on the `avatars` bucket gates writes by `(storage.foldername(name))[1]
// = auth.uid()` — the per-user pipeline fits, but `org-logos/...` doesn't.
// Rather than ship a parallel RLS policy that inspects role-assignment rows
// from inside Postgres, the admin path uses the service-role Supabase
// client (bypasses RLS) and gates rbac at the application layer instead :
// we round-trip `organizations.adminGet` first (its handler already
// enforces admin role) and bail with `forbidden` before touching Storage.
// The `organizations.adminUpdate` mutation that mirrors the URL into the
// row carries the same gate, so even a stale admin-key call can't outrun
// a revoked role.
export async function adminUploadOrgLogoAction(
  formData: FormData,
): Promise<AdminUploadOrgLogoResult> {
  const file = formData.get("file")
  const orgId = formData.get("orgId")
  if (typeof orgId !== "string" || !orgId) {
    return { ok: false, errorCode: "upstream" }
  }
  if (!(file instanceof File)) {
    return { ok: false, errorCode: "invalidType" }
  }
  if (!LOGO_ALLOWED_MIME.has(file.type)) {
    return { ok: false, errorCode: "invalidType" }
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, errorCode: "tooLarge" }
  }

  const supabase = await createSupabaseServerClient()
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return { ok: false, errorCode: "notAuthenticated" }

  // Confirm the caller is admin AND the org exists before touching
  // Storage. Reuses the rbac-gated `adminGet` for the dual purpose ;
  // throws UNAUTHORIZED / FORBIDDEN if the caller lost permission, or
  // NOT_FOUND if the orgId is bogus.
  const api = createServerTrpcClient(accessToken)
  try {
    await api.organizations.adminGet.query({ id: orgId })
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "data" in error
        ? (error as { data?: { code?: string } }).data?.code
        : undefined
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
      return { ok: false, errorCode: "forbidden" }
    }
    console.error("adminUploadOrgLogoAction adminGet failed", error)
    return { ok: false, errorCode: "upstream" }
  }

  let processed: Buffer
  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer())
    processed = await sharp(inputBuffer)
      .rotate()
      .resize(LOGO_TARGET_PX, LOGO_TARGET_PX, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    return { ok: false, errorCode: "invalidType" }
  }

  const timestamp = Date.now()
  const path = `org-logos/${orgId}/${timestamp}.webp`
  const adminStorage = createSupabaseAdminClient()
  const { error: uploadError } = await adminStorage.storage
    .from("avatars")
    .upload(path, processed, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false,
    })
  if (uploadError) {
    // Surface the underlying reason in dev logs so an operator looking
    // at api / web logs can tell apart "RLS rejected", "bucket missing",
    // and "transport timed out" without strapping on a debugger.
    console.error("adminUploadOrgLogoAction storage upload failed", uploadError)
    return { ok: false, errorCode: "upstream" }
  }

  const { data: publicData } = adminStorage.storage
    .from("avatars")
    .getPublicUrl(path)
  const logoUrl = `${publicData.publicUrl}?v=${timestamp}`

  try {
    await api.organizations.adminUpdate.mutate({ id: orgId, logoUrl })
  } catch (error) {
    console.error("adminUploadOrgLogoAction adminUpdate failed", error)
    return { ok: false, errorCode: "upstream" }
  }
  return { ok: true, logoUrl }
}
