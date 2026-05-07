import { describe, expect, it, vi, beforeEach } from "vitest"

// Module-level mocks. `vi.mock` is hoisted above the `import` of the
// action under test so the action sees the stubs from line 1. The
// stub functions get reset in `beforeEach` ; per-test behaviour is
// configured by changing the `mockReturnValue` / `mockResolvedValue`.

// `redirect` from next/navigation throws a magic NEXT_REDIRECT
// internally so the framework knows to send a 303 ; in tests we
// substitute a simpler "throw with a known shape" so the test can
// assert "we redirected to URL X" without importing Next internals.
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`__redirect__:${url}`)
})
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}))

// Supabase server client. The action reads / writes through the
// auth helper ; we stub the methods it touches.
const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn(async () => ({ error: null }))
const mockGetSession = vi.fn(async () => ({
  data: { session: { access_token: "tok" } },
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: (input: { email: string; password: string }) =>
        mockSignInWithPassword(input),
      signOut: (opts: { scope: "local" | "global" }) => mockSignOut(opts),
      getSession: () => mockGetSession(),
    },
  }),
}))

// Trusted-device + TOTP-pending cookie helpers. The action calls
// these for side effects ; we record the call counts.
const mockRecognize = vi.fn(async (_token: string) => "td-1")
vi.mock("@/lib/trusted-device-cookie", () => ({
  recognizeDeviceAfterAuth: (token: string) => mockRecognize(token),
}))
const mockSetTotpPending = vi.fn(async (_id: string) => {})
const mockClearTotpPending = vi.fn(async () => {})
vi.mock("@/lib/totp-pending-cookie", () => ({
  setTotpPending: (id: string) => mockSetTotpPending(id),
  clearTotpPending: () => mockClearTotpPending(),
}))

// Server-side tRPC client. The action calls a handful of procedures ;
// each mock returns the minimum shape the action consumes.
const mockIsChallengeRequired = vi.fn(async () => false)
const mockNotifySignedIn = vi.fn(async () => {})
const mockNotifySignedOut = vi.fn(async () => {})
const mockConsumePending = vi.fn(async () => {})
const mockMeQuery = vi.fn(async () => ({ deletedAt: null }))
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_token?: string) => ({
    auth: {
      totp: {
        isChallengeRequired: {
          query: (input: { trustedDeviceId: string | null }) =>
            mockIsChallengeRequired(input),
        },
      },
      notifySignedIn: { mutate: (input?: unknown) => mockNotifySignedIn(input) },
      notifySignedOut: { mutate: (input: unknown) => mockNotifySignedOut(input) },
    },
    organizations: {
      invites: { consumePending: { mutate: () => mockConsumePending() } },
    },
    users: { me: { query: () => mockMeQuery() } },
  }),
}))

// Import AFTER all mocks are declared.
import {
  signInAction,
  signOutAction,
} from "@/app/(anon)/signin/actions"

beforeEach(() => {
  vi.clearAllMocks()
  // Default happy-path Supabase response unless a test overrides.
  mockSignInWithPassword.mockResolvedValue({
    data: {
      user: { email: "u@x.io", email_confirmed_at: "2026-01-01T00:00:00Z" },
      session: { access_token: "tok" },
    },
    error: null,
  })
  mockIsChallengeRequired.mockResolvedValue(false)
  mockMeQuery.mockResolvedValue({ deletedAt: null })
})

describe("signInAction", () => {
  it("redirects to /account on a successful no-TOTP sign-in", async () => {
    await expect(
      signInAction({ email: "u@x.io", password: "pw" }),
    ).rejects.toThrow("__redirect__:/account")
    // Sanity : the action also fired the side-effect emits.
    expect(mockNotifySignedIn).toHaveBeenCalledWith({ trustedDeviceId: "td-1" })
    expect(mockConsumePending).toHaveBeenCalledTimes(1)
    expect(mockClearTotpPending).toHaveBeenCalledTimes(1)
  })

  it("redirects to /account/danger when the user is in deletion grace", async () => {
    mockMeQuery.mockResolvedValueOnce({ deletedAt: new Date() })
    await expect(
      signInAction({ email: "u@x.io", password: "pw" }),
    ).rejects.toThrow("__redirect__:/account/danger")
  })

  it("returns invalidCredentials on a Supabase auth error", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    })
    const result = await signInAction({ email: "u@x.io", password: "wrong" })
    expect(result).toEqual({ ok: false, errorCode: "invalidCredentials" })
    expect(mockNotifySignedIn).not.toHaveBeenCalled()
  })

  it("redirects to /signup/check-email on email_not_confirmed", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "email_not_confirmed" },
    })
    await expect(
      signInAction({ email: "u@x.io", password: "pw" }),
    ).rejects.toThrow("__redirect__:/signup/check-email?email=u%40x.io")
  })

  it("URL-encodes the email before redirecting to check-email", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "email_not_confirmed" },
    })
    await expect(
      signInAction({ email: "user+tag@x.io", password: "pw" }),
    ).rejects.toThrow("__redirect__:/signup/check-email?email=user%2Btag%40x.io")
  })

  it("redirects to /signup/check-email when the user exists but email isn't confirmed", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        user: { email: "u@x.io", email_confirmed_at: null },
        session: { access_token: "tok" },
      },
      error: null,
    })
    await expect(
      signInAction({ email: "u@x.io", password: "pw" }),
    ).rejects.toThrow("__redirect__:/signup/check-email?email=u%40x.io")
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" })
  })

  it("redirects to /signin/totp when the device requires a TOTP challenge", async () => {
    mockIsChallengeRequired.mockResolvedValueOnce(true)
    await expect(
      signInAction({ email: "u@x.io", password: "pw" }),
    ).rejects.toThrow("__redirect__:/signin/totp")
    expect(mockSetTotpPending).toHaveBeenCalledWith("td-1")
    // notifySignedIn deferred until after TOTP clears.
    expect(mockNotifySignedIn).not.toHaveBeenCalled()
  })

  it("swallows a notifySignedIn failure (best-effort emit)", async () => {
    mockNotifySignedIn.mockRejectedValueOnce(new Error("boom"))
    await expect(
      signInAction({ email: "u@x.io", password: "pw" }),
    ).rejects.toThrow("__redirect__:/account")
  })

  it("swallows a consumePending failure (best-effort)", async () => {
    mockConsumePending.mockRejectedValueOnce(new Error("boom"))
    await expect(
      signInAction({ email: "u@x.io", password: "pw" }),
    ).rejects.toThrow("__redirect__:/account")
  })
})

describe("signOutAction", () => {
  it("emits notifySignedOut with the local scope by default", async () => {
    await expect(signOutAction()).rejects.toThrow("__redirect__:/signin")
    expect(mockNotifySignedOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" })
    expect(mockClearTotpPending).toHaveBeenCalled()
  })

  it("forwards the scope to both the emit + Supabase signOut", async () => {
    await expect(signOutAction("global")).rejects.toThrow(
      "__redirect__:/signin",
    )
    expect(mockNotifySignedOut).toHaveBeenCalledWith({ scope: "global" })
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" })
  })

  it("skips the emit when no live session is found", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    await expect(signOutAction()).rejects.toThrow("__redirect__:/signin")
    expect(mockNotifySignedOut).not.toHaveBeenCalled()
    // Supabase signOut still fires so any cookies clear cleanly.
    expect(mockSignOut).toHaveBeenCalled()
  })

  it("swallows a notifySignedOut failure (best-effort)", async () => {
    mockNotifySignedOut.mockRejectedValueOnce(new Error("boom"))
    await expect(signOutAction()).rejects.toThrow("__redirect__:/signin")
    expect(mockSignOut).toHaveBeenCalled()
  })
})
