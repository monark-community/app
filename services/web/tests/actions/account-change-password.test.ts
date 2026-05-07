import { describe, expect, it, vi, beforeEach } from "vitest"

// `account/actions.ts` imports `sharp` at the module top for the
// avatar / banner upload paths. Mock it so the native binary doesn't
// load inside vitest's jsdom env (sharp's prebuilds aren't always
// available + we don't exercise it here).
vi.mock("sharp", () => ({
  default: vi.fn(),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  })),
}))

// The action calls Supabase directly through two clients : the
// cookie-bound SSR client (for live session ops) and a fresh
// non-persisting client (for verifying the current password). We
// mock both.
const mockGetUser = vi.fn(async () => ({
  data: { user: { id: "u1", email: "u@x.io" } },
}))
const mockGetSession = vi.fn(async () => ({
  data: { session: { access_token: "tok" } },
}))
const mockUpdateUser = vi.fn(async (_p: { password: string }) => ({
  data: { user: { id: "u1" } },
  error: null,
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => mockGetSession(),
      updateUser: (p: { password: string }) => mockUpdateUser(p),
    },
  }),
}))

const mockSignInWithPassword = vi.fn(async () => ({ error: null }))
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (i: { email: string; password: string }) =>
        mockSignInWithPassword(i),
    },
  }),
}))

const mockTotpStatus = vi.fn(async () => ({ enrolled: false }))
const mockVerifyCode = vi.fn(async () => ({ ok: true }))
const mockCheckPassword = vi.fn(async () => ({ ok: true, score: 4 }))
const mockMe = vi.fn(async () => ({ displayName: "Test" }))
const mockNotifyPasswordChanged = vi.fn(async () => {})
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_t?: string) => ({
    auth: {
      totp: {
        status: { query: () => mockTotpStatus() },
        verifyCode: { mutate: (i: { code: string }) => mockVerifyCode(i) },
      },
      checkPassword: {
        mutate: (i: { password: string; email: string; displayName?: string }) =>
          mockCheckPassword(i),
      },
      notifyPasswordChanged: {
        mutate: (i: { triggeredBy: string }) => mockNotifyPasswordChanged(i),
      },
    },
    users: { me: { query: () => mockMe() } },
  }),
}))

vi.mock("@/i18n/set-locale-action", () => ({
  setLocaleAction: vi.fn(async () => {}),
}))

import { changePasswordAction } from "@/app/(authed)/account/actions"

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({
    data: { user: { id: "u1", email: "u@x.io" } },
  })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "tok" } },
  })
  mockUpdateUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null })
  mockSignInWithPassword.mockResolvedValue({ error: null })
  mockTotpStatus.mockResolvedValue({ enrolled: false })
  mockVerifyCode.mockResolvedValue({ ok: true })
  mockCheckPassword.mockResolvedValue({ ok: true, score: 4 })
  mockMe.mockResolvedValue({ displayName: "Test" })
})

describe("changePasswordAction", () => {
  it("returns ok on the happy non-TOTP path", async () => {
    const result = await changePasswordAction({
      currentPassword: "old-pass",
      newPassword: "new-strong-pass-123",
    })
    expect(result).toEqual({ ok: true })
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "u@x.io",
      password: "old-pass",
    })
    expect(mockUpdateUser).toHaveBeenCalledWith({
      password: "new-strong-pass-123",
    })
    expect(mockNotifyPasswordChanged).toHaveBeenCalledWith({
      triggeredBy: "user",
    })
  })

  it("returns upstream when getUser is empty (no live session)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "new",
    })
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
    // Did not proceed past the email lookup.
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it("returns invalidCurrentPassword when Supabase rejects the verify call", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid credentials", code: "invalid_credentials" },
    })
    const result = await changePasswordAction({
      currentPassword: "wrong",
      newPassword: "anything",
    })
    expect(result).toEqual({ ok: false, errorCode: "invalidCurrentPassword" })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it("returns upstream when no access_token is on the session", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "new",
    })
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
  })

  it("returns totpRequired when TOTP is enrolled but no code is supplied", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "new-pass-123",
    })
    expect(result).toEqual({ ok: false, errorCode: "totpRequired" })
    expect(mockVerifyCode).not.toHaveBeenCalled()
  })

  it("returns totpRequired when the supplied code is too short", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "new-pass-123",
      totpCode: "12345", // 5 digits, server requires 6
    })
    expect(result).toEqual({ ok: false, errorCode: "totpRequired" })
  })

  it("returns invalidTotpCode when TOTP verify fails", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    mockVerifyCode.mockResolvedValueOnce({ ok: false })
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "new-pass-123",
      totpCode: "999999",
    })
    expect(result).toEqual({ ok: false, errorCode: "invalidTotpCode" })
  })

  it("proceeds past TOTP gate when verification succeeds", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    mockVerifyCode.mockResolvedValueOnce({ ok: true })
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "new-strong-pass",
      totpCode: "123456",
    })
    expect(result).toEqual({ ok: true })
    expect(mockUpdateUser).toHaveBeenCalled()
  })

  it("returns weakPassword when checkPassword reports !ok", async () => {
    mockCheckPassword.mockResolvedValueOnce({ ok: false, score: 1 })
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "weak",
    })
    expect(result).toEqual({ ok: false, errorCode: "weakPassword" })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it("returns weakPassword when checkPassword throws (best-effort fallback)", async () => {
    mockCheckPassword.mockRejectedValueOnce(new Error("upstream"))
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "anything",
    })
    expect(result).toEqual({ ok: false, errorCode: "weakPassword" })
  })

  it("returns upstream when Supabase updateUser fails", async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "boom" },
    })
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "new-pass",
    })
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
    // notifyPasswordChanged is NOT called when the rotation fails ;
    // the event is the post-success signal.
    expect(mockNotifyPasswordChanged).not.toHaveBeenCalled()
  })

  it("swallows a notifyPasswordChanged failure (best-effort emit)", async () => {
    mockNotifyPasswordChanged.mockRejectedValueOnce(new Error("boom"))
    const result = await changePasswordAction({
      currentPassword: "old",
      newPassword: "new-pass",
    })
    // Action still succeeds : the rotation already landed.
    expect(result).toEqual({ ok: true })
  })

  it("passes the user's display name into the strength check (rule context)", async () => {
    mockMe.mockResolvedValueOnce({ displayName: "Dominic" })
    await changePasswordAction({
      currentPassword: "old",
      newPassword: "Dominic-something",
    })
    expect(mockCheckPassword).toHaveBeenCalledWith({
      password: "Dominic-something",
      email: "u@x.io",
      displayName: "Dominic",
    })
  })

  it("falls back to undefined displayName when users.me throws", async () => {
    mockMe.mockRejectedValueOnce(new Error("upstream"))
    await changePasswordAction({
      currentPassword: "old",
      newPassword: "anything-pass",
    })
    expect(mockCheckPassword).toHaveBeenCalledWith({
      password: "anything-pass",
      email: "u@x.io",
      displayName: undefined,
    })
  })

  it("does not touch the TOTP path when the user isn't enrolled", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: false })
    await changePasswordAction({
      currentPassword: "old",
      newPassword: "new-pass-123",
      totpCode: "123456", // ignored
    })
    expect(mockVerifyCode).not.toHaveBeenCalled()
  })
})
