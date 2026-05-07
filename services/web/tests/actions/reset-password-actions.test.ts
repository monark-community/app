import { describe, expect, it, vi, beforeEach } from "vitest"

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`__redirect__:${url}`)
})
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}))

const mockGetUser = vi.fn(async () => ({
  data: { user: { id: "u1", email: "u@x.io" } },
  error: null,
}))
const mockGetSession = vi.fn(async () => ({
  data: { session: { access_token: "tok" } },
}))
const mockUpdateUser = vi.fn(async () => ({ error: null }))
const mockSignOut = vi.fn(async () => ({ error: null }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => mockGetSession(),
      updateUser: (i: { password: string }) => mockUpdateUser(i),
      signOut: (i: { scope: string }) => mockSignOut(i),
    },
  }),
}))

const mockTotpStatus = vi.fn(async () => ({ enrolled: false }))
const mockVerifyCode = vi.fn(async () => ({ ok: true }))
const mockCheckPassword = vi.fn(async () => ({ ok: true, score: 4 }))
const mockNotifyPasswordChanged = vi.fn(async () => {})
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_t?: string) => ({
    auth: {
      totp: {
        status: { query: () => mockTotpStatus() },
        verifyCode: { mutate: (i: { code: string }) => mockVerifyCode(i) },
      },
      checkPassword: {
        mutate: (i: { password: string; email: string }) =>
          mockCheckPassword(i),
      },
      notifyPasswordChanged: {
        mutate: (i: { triggeredBy: string }) => mockNotifyPasswordChanged(i),
      },
    },
  }),
}))

const mockClearTotpPending = vi.fn(async () => {})
vi.mock("@/lib/totp-pending-cookie", () => ({
  clearTotpPending: () => mockClearTotpPending(),
}))

import { resetPasswordAction } from "@/app/auth/reset-password/actions"

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({
    data: { user: { id: "u1", email: "u@x.io" } },
    error: null,
  })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "tok" } },
  })
  mockUpdateUser.mockResolvedValue({ error: null })
  mockTotpStatus.mockResolvedValue({ enrolled: false })
  mockVerifyCode.mockResolvedValue({ ok: true })
  mockCheckPassword.mockResolvedValue({ ok: true, score: 4 })
})

describe("resetPasswordAction", () => {
  it("redirects to /signin?passwordReset=1 on the happy non-TOTP path", async () => {
    await expect(
      resetPasswordAction({ newPassword: "new-strong-password" }),
    ).rejects.toThrow("__redirect__:/signin?passwordReset=1")
    expect(mockUpdateUser).toHaveBeenCalledWith({
      password: "new-strong-password",
    })
    // Reset path : triggeredBy is 'reset', not 'user'.
    expect(mockNotifyPasswordChanged).toHaveBeenCalledWith({
      triggeredBy: "reset",
    })
    // Tail-end housekeeping : drop any pending totp cookie + sign
    // the temporary recovery session out so the next sign-in is
    // through the normal flow.
    expect(mockClearTotpPending).toHaveBeenCalled()
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" })
  })

  it("returns noSession when getUser errors out", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "no session" },
    })
    const result = await resetPasswordAction({ newPassword: "anything" })
    expect(result).toEqual({ ok: false, errorCode: "noSession" })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it("returns noSession when no email is on the user record", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: null } },
      error: null,
    })
    const result = await resetPasswordAction({ newPassword: "anything" })
    expect(result).toEqual({ ok: false, errorCode: "noSession" })
  })

  it("returns noSession when no access token is on the session", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    const result = await resetPasswordAction({ newPassword: "anything" })
    expect(result).toEqual({ ok: false, errorCode: "noSession" })
  })

  it("returns totpRequired when TOTP-enrolled user supplies no code", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    const result = await resetPasswordAction({ newPassword: "new-pass" })
    expect(result).toEqual({ ok: false, errorCode: "totpRequired" })
    expect(mockVerifyCode).not.toHaveBeenCalled()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it("returns totpRequired when the supplied TOTP code is too short", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    const result = await resetPasswordAction({
      newPassword: "new-pass",
      totpCode: "12345",
    })
    expect(result).toEqual({ ok: false, errorCode: "totpRequired" })
  })

  it("returns invalidTotpCode when TOTP verification fails", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    mockVerifyCode.mockResolvedValueOnce({ ok: false })
    const result = await resetPasswordAction({
      newPassword: "new-pass",
      totpCode: "999999",
    })
    expect(result).toEqual({ ok: false, errorCode: "invalidTotpCode" })
  })

  it("returns invalidTotpCode when verifyCode throws", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    mockVerifyCode.mockRejectedValueOnce(new Error("upstream"))
    const result = await resetPasswordAction({
      newPassword: "new-pass",
      totpCode: "123456",
    })
    expect(result).toEqual({ ok: false, errorCode: "invalidTotpCode" })
  })

  it("proceeds past TOTP gate on a valid code", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    mockVerifyCode.mockResolvedValueOnce({ ok: true })
    await expect(
      resetPasswordAction({
        newPassword: "new-strong-password",
        totpCode: "123456",
      }),
    ).rejects.toThrow("__redirect__:/signin?passwordReset=1")
    expect(mockUpdateUser).toHaveBeenCalled()
  })

  it("returns weakPassword when checkPassword reports !ok", async () => {
    mockCheckPassword.mockResolvedValueOnce({ ok: false, score: 1 })
    const result = await resetPasswordAction({ newPassword: "weak" })
    expect(result).toEqual({ ok: false, errorCode: "weakPassword" })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it("returns weakPassword when checkPassword throws", async () => {
    mockCheckPassword.mockRejectedValueOnce(new Error("upstream"))
    const result = await resetPasswordAction({ newPassword: "anything" })
    expect(result).toEqual({ ok: false, errorCode: "weakPassword" })
  })

  it("returns upstream when Supabase updateUser fails", async () => {
    mockUpdateUser.mockResolvedValueOnce({
      error: { message: "boom" },
    })
    const result = await resetPasswordAction({ newPassword: "new-strong" })
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
    // The notify event is the *post-success* signal ; it must not
    // fire when the update itself fails.
    expect(mockNotifyPasswordChanged).not.toHaveBeenCalled()
  })

  it("swallows a notifyPasswordChanged failure (best-effort emit)", async () => {
    mockNotifyPasswordChanged.mockRejectedValueOnce(new Error("boom"))
    await expect(
      resetPasswordAction({ newPassword: "new-strong-password" }),
    ).rejects.toThrow("__redirect__:/signin?passwordReset=1")
  })

  it("does not require TOTP for users who aren't enrolled", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: false })
    await expect(
      resetPasswordAction({
        newPassword: "new-strong-password",
        totpCode: "123456", // ignored
      }),
    ).rejects.toThrow("__redirect__:/signin?passwordReset=1")
    expect(mockVerifyCode).not.toHaveBeenCalled()
  })

  it("treats a totp.status query failure as 'not enrolled' (degrades open)", async () => {
    // If the status query throws, the action treats the user as
    // non-enrolled rather than blocking the reset entirely. Otherwise
    // a transient API failure would brick everyone's password reset.
    mockTotpStatus.mockRejectedValueOnce(new Error("upstream"))
    await expect(
      resetPasswordAction({ newPassword: "new-strong-password" }),
    ).rejects.toThrow("__redirect__:/signin?passwordReset=1")
    expect(mockVerifyCode).not.toHaveBeenCalled()
    expect(mockUpdateUser).toHaveBeenCalled()
  })

  it("passes the user's email into the strength check (rule context)", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "alice@x.io" } },
      error: null,
    })
    await expect(
      resetPasswordAction({ newPassword: "alice-pass-x" }),
    ).rejects.toThrow("__redirect__:/signin?passwordReset=1")
    expect(mockCheckPassword).toHaveBeenCalledWith({
      password: "alice-pass-x",
      email: "alice@x.io",
    })
  })
})
