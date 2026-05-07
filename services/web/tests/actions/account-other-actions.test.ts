import { describe, expect, it, vi, beforeEach } from "vitest"

// Same `sharp` mock the change-password test uses ; the actions
// file imports it at module-top for the upload paths.
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

const mockGetUser = vi.fn(async () => ({
  data: { user: { id: "u1", email: "u@x.io" } },
}))
const mockGetSession = vi.fn(async () => ({
  data: { session: { access_token: "tok" } },
}))
const mockUpdateUser = vi.fn(async (_p: unknown) => ({
  data: { user: { id: "u1", email: "u@x.io" } },
  error: null,
}))
const mockVerifyOtp = vi.fn(async () => ({
  data: { user: { id: "u1", email: "new@x.io" } },
  error: null,
}))
const mockSignOut = vi.fn(async () => ({ error: null }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => mockGetSession(),
      updateUser: (p: unknown) => mockUpdateUser(p),
      verifyOtp: (i: { type: string; email: string; token: string }) =>
        mockVerifyOtp(i),
      signOut: (i: { scope: string }) => mockSignOut(i),
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
const mockUpdateProfile = vi.fn(async () => {})
const mockSyncEmail = vi.fn(async () => {})
const mockRequestDeletion = vi.fn(async () => ({
  deletionCompletesAt: "2026-05-19T12:00:00Z",
}))
const mockCancelDeletion = vi.fn(async () => {})
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_t?: string) => ({
    auth: {
      totp: {
        status: { query: () => mockTotpStatus() },
        verifyCode: { mutate: (i: { code: string }) => mockVerifyCode(i) },
      },
    },
    users: {
      updateProfile: { mutate: (i: unknown) => mockUpdateProfile(i) },
      syncEmail: { mutate: (i: { email: string }) => mockSyncEmail(i) },
      requestAccountDeletion: { mutate: () => mockRequestDeletion() },
      cancelAccountDeletion: { mutate: () => mockCancelDeletion() },
    },
  }),
}))

const mockSetLocaleAction = vi.fn(async () => {})
vi.mock("@/i18n/set-locale-action", () => ({
  setLocaleAction: (l: "en" | "fr") => mockSetLocaleAction(l),
}))

import {
  cancelAccountDeletionAction,
  requestAccountDeletionAction,
  requestEmailChangeAction,
  updateLocaleAction,
  verifyEmailChangeOtpAction,
} from "@/app/(authed)/account/actions"

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({
    data: { user: { id: "u1", email: "u@x.io" } },
  })
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "tok" } },
  })
  mockUpdateUser.mockResolvedValue({
    data: { user: { id: "u1", email: "u@x.io" } },
    error: null,
  })
  mockVerifyOtp.mockResolvedValue({
    data: { user: { id: "u1", email: "new@x.io" } },
    error: null,
  })
  mockSignInWithPassword.mockResolvedValue({ error: null })
  mockTotpStatus.mockResolvedValue({ enrolled: false })
  mockVerifyCode.mockResolvedValue({ ok: true })
  mockRequestDeletion.mockResolvedValue({
    deletionCompletesAt: "2026-05-19T12:00:00Z",
  })
})

describe("updateLocaleAction", () => {
  it("persists the locale through the API + Supabase + cookie", async () => {
    await updateLocaleAction("fr")
    expect(mockUpdateProfile).toHaveBeenCalledWith({ localePreference: "fr" })
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: { locale_preference: "fr" },
    })
    expect(mockSetLocaleAction).toHaveBeenCalledWith("fr")
  })

  it("works without a live session (cookie still flips)", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    await updateLocaleAction("en")
    expect(mockUpdateProfile).not.toHaveBeenCalled()
    expect(mockSetLocaleAction).toHaveBeenCalledWith("en")
  })

  it("swallows API + Supabase failures so the cookie still updates", async () => {
    mockUpdateProfile.mockRejectedValueOnce(new Error("upstream"))
    mockUpdateUser.mockRejectedValueOnce(new Error("upstream"))
    await updateLocaleAction("fr")
    expect(mockSetLocaleAction).toHaveBeenCalledWith("fr")
  })
})

describe("requestEmailChangeAction", () => {
  it("returns ok on the happy non-TOTP path", async () => {
    const result = await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "new@x.io",
    })
    expect(result).toEqual({ ok: true })
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: "new@x.io" })
  })

  it("returns upstream when the new email is malformed (no @)", async () => {
    const result = await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "no-at-sign",
    })
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
  })

  it("returns sameEmail when the new value matches the current (case-insensitive)", async () => {
    const result = await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "U@X.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "sameEmail" })
  })

  it("returns invalidCurrentPassword when verifier rejects", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid", code: "invalid_credentials" },
    })
    const result = await requestEmailChangeAction({
      currentPassword: "wrong",
      newEmail: "new@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "invalidCurrentPassword" })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it("returns totpRequired when enrolled user supplies no code", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    const result = await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "new@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "totpRequired" })
  })

  it("returns invalidTotpCode when verifyCode returns !ok", async () => {
    mockTotpStatus.mockResolvedValueOnce({ enrolled: true })
    mockVerifyCode.mockResolvedValueOnce({ ok: false })
    const result = await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "new@x.io",
      totpCode: "999999",
    })
    expect(result).toEqual({ ok: false, errorCode: "invalidTotpCode" })
  })

  it("maps Supabase email_exists → emailInUse", async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "email_exists", message: "in use" },
    })
    const result = await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "taken@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "emailInUse" })
  })

  it("maps Supabase email_address_invalid → emailInUse", async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "email_address_invalid", message: "bad" },
    })
    const result = await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "weird@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "emailInUse" })
  })

  it("returns upstream for other Supabase update errors", async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "rate_limited", message: "slow down" },
    })
    const result = await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "new@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
  })

  it("trims + lowercases the new email before submission", async () => {
    await requestEmailChangeAction({
      currentPassword: "pw",
      newEmail: "  NEW@X.io  ",
    })
    expect(mockUpdateUser).toHaveBeenCalledWith({ email: "new@x.io" })
  })
})

describe("verifyEmailChangeOtpAction", () => {
  it("returns missing when the token is empty", async () => {
    const result = await verifyEmailChangeOtpAction({
      newEmail: "new@x.io",
      token: "",
    })
    expect(result).toEqual({ ok: false, errorCode: "missing" })
  })

  it("returns missing when the new email is empty", async () => {
    const result = await verifyEmailChangeOtpAction({
      newEmail: "",
      token: "123456",
    })
    expect(result).toEqual({ ok: false, errorCode: "missing" })
  })

  it("returns notAuthenticated when getUser is empty", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await verifyEmailChangeOtpAction({
      newEmail: "new@x.io",
      token: "123456",
    })
    expect(result).toEqual({ ok: false, errorCode: "notAuthenticated" })
  })

  it("returns invalidCode when both verify attempts fail", async () => {
    mockVerifyOtp
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: "bad" },
      })
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: "still bad" },
      })
    const result = await verifyEmailChangeOtpAction({
      newEmail: "new@x.io",
      token: "999999",
    })
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" })
  })

  it("returns rotated:false + pendingOtherSide:true when only one side confirmed", async () => {
    // After one verify, the user's email is still the OLD address —
    // the rotation is half-done.
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "u@x.io" } },
      error: null,
    })
    const result = await verifyEmailChangeOtpAction({
      newEmail: "new@x.io",
      token: "123456",
    })
    expect(result).toEqual({
      ok: true,
      pendingOtherSide: true,
      rotated: false,
    })
    // No sign-out happens for half-done rotations.
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it("syncs the shadow row + signs the user out when rotation completes", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: "u1", email: "new@x.io" } },
      error: null,
    })
    const result = await verifyEmailChangeOtpAction({
      newEmail: "new@x.io",
      token: "123456",
    })
    expect(result).toEqual({
      ok: true,
      pendingOtherSide: false,
      rotated: true,
    })
    expect(mockSyncEmail).toHaveBeenCalledWith({ email: "new@x.io" })
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" })
  })

  it("falls back to the old-email verify when the new-email attempt fails", async () => {
    // First call (against new email) errors → action retries against old email.
    mockVerifyOtp
      .mockResolvedValueOnce({
        data: { user: null },
        error: { message: "wrong inbox" },
      })
      .mockResolvedValueOnce({
        data: { user: { id: "u1", email: "new@x.io" } },
        error: null,
      })
    const result = await verifyEmailChangeOtpAction({
      newEmail: "new@x.io",
      token: "123456",
    })
    expect(result).toEqual({
      ok: true,
      pendingOtherSide: false,
      rotated: true,
    })
    // Both verify calls happened — `email` differs across the two.
    expect(mockVerifyOtp).toHaveBeenCalledTimes(2)
  })
})

describe("requestAccountDeletionAction", () => {
  it("returns ok with the deletion-completes-at on the happy path", async () => {
    const result = await requestAccountDeletionAction({
      emailConfirmation: "u@x.io",
    })
    expect(result).toEqual({
      ok: true,
      deletionCompletesAt: "2026-05-19T12:00:00.000Z",
    })
    // Sign-out fires after the request is recorded.
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" })
  })

  it("returns notAuthenticated when getUser is empty", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await requestAccountDeletionAction({
      emailConfirmation: "u@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "notAuthenticated" })
  })

  it("returns invalidConfirmation when the typed email mismatches", async () => {
    const result = await requestAccountDeletionAction({
      emailConfirmation: "wrong@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "invalidConfirmation" })
    expect(mockRequestDeletion).not.toHaveBeenCalled()
  })

  it("matches the typed email case-insensitively + with whitespace", async () => {
    const result = await requestAccountDeletionAction({
      emailConfirmation: "  U@X.IO  ",
    })
    expect(result.ok).toBe(true)
  })

  it("returns notAuthenticated when no access token is on the session", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    const result = await requestAccountDeletionAction({
      emailConfirmation: "u@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "notAuthenticated" })
  })

  it("returns upstream when the API throws", async () => {
    mockRequestDeletion.mockRejectedValueOnce(new Error("boom"))
    const result = await requestAccountDeletionAction({
      emailConfirmation: "u@x.io",
    })
    expect(result).toEqual({ ok: false, errorCode: "upstream" })
    // Sign-out doesn't fire when the request itself fails.
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})

describe("cancelAccountDeletionAction", () => {
  it("returns ok on the happy path", async () => {
    const result = await cancelAccountDeletionAction()
    expect(result).toEqual({ ok: true })
    expect(mockCancelDeletion).toHaveBeenCalled()
  })

  it("returns ok:false when there's no live session", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    const result = await cancelAccountDeletionAction()
    expect(result).toEqual({ ok: false })
    expect(mockCancelDeletion).not.toHaveBeenCalled()
  })

  it("returns ok:false when the API throws", async () => {
    mockCancelDeletion.mockRejectedValueOnce(new Error("upstream"))
    const result = await cancelAccountDeletionAction()
    expect(result).toEqual({ ok: false })
  })
})
