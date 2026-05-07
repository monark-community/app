import { describe, expect, it, vi, beforeEach } from "vitest"

const mockSharp = vi.fn(() => mockSharpChain)
const mockSharpChain = {
  rotate: () => mockSharpChain,
  resize: () => mockSharpChain,
  webp: () => mockSharpChain,
  toBuffer: vi.fn(async () => Buffer.from("processed-bytes")),
}
vi.mock("sharp", () => ({
  default: mockSharp,
}))

const mockGetSession = vi.fn(async () => ({
  data: { session: { access_token: "tok" } },
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getSession: () => mockGetSession() },
  }),
}))

const mockAdminUpload = vi.fn(async () => ({ data: null, error: null }))
const mockGetPublicUrl = vi.fn(() => ({
  data: { publicUrl: "https://supabase.local/storage/v1/avatars/path" },
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: (_bucket: string) => ({
        upload: (path: string, body: unknown, opts: unknown) =>
          mockAdminUpload(path, body, opts),
        getPublicUrl: (path: string) => mockGetPublicUrl(path),
      }),
    },
  }),
}))

const mockAdminGet = vi.fn(async () => ({
  id: "org-1",
  slug: "acme",
  displayName: "Acme",
  logoUrl: null,
}))
const mockAdminUpdate = vi.fn(async () => ({ id: "org-1" }))
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_t?: string) => ({
    organizations: {
      adminGet: { query: (i: { id: string }) => mockAdminGet(i) },
      adminUpdate: { mutate: (i: unknown) => mockAdminUpdate(i) },
    },
  }),
}))

import { adminUploadOrgLogoAction } from "@/app/(authed)/admin/organizations/actions"

function makeFormData(input: {
  file?: unknown
  orgId?: unknown
}): FormData {
  const fd = new FormData()
  if (input.file !== undefined) fd.set("file", input.file as Blob | string)
  if (input.orgId !== undefined) fd.set("orgId", input.orgId as string)
  return fd
}

function makeFile({
  type = "image/png",
  size = 1024,
  name = "logo.png",
}: {
  type?: string
  size?: number
  name?: string
} = {}): File {
  // jsdom's File ctor takes BlobPart[]. Build a buffer of the right
  // size so `file.size` reads back correctly.
  const bytes = new Uint8Array(size)
  return new File([bytes], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSharp.mockReturnValue(mockSharpChain)
  mockSharpChain.toBuffer.mockResolvedValue(Buffer.from("processed-bytes"))
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "tok" } },
  })
  mockAdminUpload.mockResolvedValue({ data: null, error: null })
  mockGetPublicUrl.mockReturnValue({
    data: { publicUrl: "https://supabase.local/storage/v1/avatars/path" },
  })
  mockAdminGet.mockResolvedValue({
    id: "org-1",
    slug: "acme",
    displayName: "Acme",
    logoUrl: null,
  })
  mockAdminUpdate.mockResolvedValue({ id: "org-1" })
})

describe("adminUploadOrgLogoAction", () => {
  it("returns ok with the public URL on the happy path", async () => {
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Cache-buster `?v=<ts>` is appended.
      expect(result.logoUrl).toMatch(
        /^https:\/\/supabase\.local\/storage\/v1\/avatars\/path\?v=\d+$/,
      )
    }
    // Storage upload + admin-update both fired.
    expect(mockAdminUpload).toHaveBeenCalledTimes(1)
    expect(mockAdminUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "org-1" }),
    )
  })

  it("uploads to org-logos/<orgId>/<ts>.webp", async () => {
    await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-7" }),
    )
    const path = mockAdminUpload.mock.calls[0]![0] as string
    expect(path).toMatch(/^org-logos\/org-7\/\d+\.webp$/)
  })

  it("returns upstream when orgId is missing", async () => {
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile() }),
    )
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
    expect(mockAdminUpload).not.toHaveBeenCalled()
  })

  it("returns invalidType when no file is supplied", async () => {
    const result = await adminUploadOrgLogoAction(
      makeFormData({ orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "invalidType" })
  })

  it("returns invalidType when the file MIME isn't allowed", async () => {
    const result = await adminUploadOrgLogoAction(
      makeFormData({
        file: makeFile({ type: "image/gif" }),
        orgId: "org-1",
      }),
    )
    expect(result).toEqual({ ok: false, errorCode: "invalidType" })
    // Sharp should not have been touched.
    expect(mockSharp).not.toHaveBeenCalled()
  })

  it("accepts every allowed MIME (image/jpeg, image/png, image/webp)", async () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      vi.clearAllMocks()
      mockAdminGet.mockResolvedValue({
        id: "org-1",
        slug: "acme",
        displayName: "Acme",
        logoUrl: null,
      })
      mockAdminUpload.mockResolvedValue({ data: null, error: null })
      mockSharpChain.toBuffer.mockResolvedValue(Buffer.from("bytes"))
      const result = await adminUploadOrgLogoAction(
        makeFormData({ file: makeFile({ type }), orgId: "org-1" }),
      )
      expect(result.ok).toBe(true)
    }
  })

  it("returns tooLarge when the file exceeds 2 MB", async () => {
    const bigFile = makeFile({ size: 3 * 1024 * 1024 }) // 3 MB > 2 MB cap
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: bigFile, orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "tooLarge" })
  })

  it("returns notAuthenticated when no access token is on the session", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "notAuthenticated" })
    expect(mockAdminGet).not.toHaveBeenCalled()
  })

  it("returns forbidden when adminGet throws UNAUTHORIZED", async () => {
    const err = Object.assign(new Error("unauth"), {
      data: { code: "UNAUTHORIZED" },
    })
    mockAdminGet.mockRejectedValueOnce(err)
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "forbidden" })
    // Storage upload not touched after rbac rejection.
    expect(mockAdminUpload).not.toHaveBeenCalled()
  })

  it("returns forbidden when adminGet throws FORBIDDEN", async () => {
    const err = Object.assign(new Error("forbidden"), {
      data: { code: "FORBIDDEN" },
    })
    mockAdminGet.mockRejectedValueOnce(err)
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "forbidden" })
  })

  it("returns upstream when adminGet throws an unknown error", async () => {
    mockAdminGet.mockRejectedValueOnce(new Error("network blip"))
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
  })

  it("returns invalidType when sharp throws (corrupt image)", async () => {
    mockSharpChain.toBuffer.mockRejectedValueOnce(new Error("corrupt"))
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "invalidType" })
  })

  it("returns upstream when Storage upload fails", async () => {
    mockAdminUpload.mockResolvedValueOnce({
      data: null,
      error: { message: "RLS rejected", name: "StorageError" },
    })
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
    // adminUpdate doesn't fire when the upload itself failed.
    expect(mockAdminUpdate).not.toHaveBeenCalled()
  })

  it("returns upstream when adminUpdate fails after a successful Storage upload", async () => {
    mockAdminUpdate.mockRejectedValueOnce(new Error("DB write blip"))
    const result = await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
    // The Storage row is now orphaned ; flagged in the runbook for
    // operators to clean up. The action doesn't try to roll it back.
    expect(mockAdminUpload).toHaveBeenCalledTimes(1)
  })

  it("appends the cache-buster timestamp + passes the same URL to adminUpdate", async () => {
    await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    const updateArg = mockAdminUpdate.mock.calls[0]![0] as {
      id: string
      logoUrl: string
    }
    expect(updateArg.logoUrl).toMatch(/\?v=\d+$/)
  })

  it("forwards the resize + format pipeline to sharp (512px webp)", async () => {
    await adminUploadOrgLogoAction(
      makeFormData({ file: makeFile(), orgId: "org-1" }),
    )
    expect(mockSharp).toHaveBeenCalledTimes(1)
  })
})
