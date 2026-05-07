import { describe, expect, it, vi, beforeEach } from "vitest"
import { TRPCClientError } from "@trpc/client"

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`__redirect__:${url}`)
})
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}))

const mockHeaders = vi.fn(() => ({
  get: (_name: string) => "en-US,en;q=0.9",
}))
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}))

const mockSignUp = vi.fn(async () => ({
  needsEmailVerification: true,
  email: "u@x.io",
}))
const mockNotifySignedIn = vi.fn(async () => {})
const mockConsumePending = vi.fn(async () => {})
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_token?: string) => ({
    auth: {
      signUp: {
        mutate: (
          input: {
            email: string
            password: string
            displayName?: string
            localePreference?: string
            appUrl?: string
          },
        ) => mockSignUp(input),
      },
      notifySignedIn: { mutate: (i?: unknown) => mockNotifySignedIn(i) },
    },
    organizations: {
      invites: { consumePending: { mutate: () => mockConsumePending() } },
    },
  }),
}))

const mockSignInWithPassword = vi.fn(async () => ({
  data: { session: null },
  error: { code: "email_not_confirmed" },
}))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithPassword: (i: { email: string; password: string }) =>
        mockSignInWithPassword(i),
    },
  }),
}))

const mockGetRequestAppUrl = vi.fn(async () => "https://monark.app")
vi.mock("@/lib/request-app-url", () => ({
  getRequestAppUrl: () => mockGetRequestAppUrl(),
}))

const mockRecognize = vi.fn(async (_t: string) => "td-1")
vi.mock("@/lib/trusted-device-cookie", () => ({
  recognizeDeviceAfterAuth: (t: string) => mockRecognize(t),
}))

import { signUpAction } from "@/app/(anon)/signup/actions"

beforeEach(() => {
  vi.clearAllMocks()
  mockSignUp.mockResolvedValue({ needsEmailVerification: true, email: "u@x.io" })
  mockSignInWithPassword.mockResolvedValue({
    data: { session: null },
    error: { code: "email_not_confirmed" },
  })
  mockGetRequestAppUrl.mockResolvedValue("https://monark.app")
  mockHeaders.mockReturnValue({
    get: (_name: string) => "en-US,en;q=0.9",
  })
})

describe("signUpAction", () => {
  it("redirects to check-email when needsEmailVerification is true", async () => {
    await expect(
      signUpAction({ email: "u@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:/signup/check-email?email=u%40x.io")
  })

  it("redirects to /account when verification isn't required (auto-confirm)", async () => {
    mockSignUp.mockResolvedValueOnce({
      needsEmailVerification: false,
      email: "u@x.io",
    })
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: "tok" },
        user: { id: "u1" },
      },
      error: null,
    })
    await expect(
      signUpAction({ email: "u@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:/account")
  })

  it("URL-encodes the email when redirecting to check-email", async () => {
    mockSignUp.mockResolvedValueOnce({
      needsEmailVerification: true,
      email: "user+tag@x.io",
    })
    await expect(
      signUpAction({ email: "user+tag@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:/signup/check-email?email=user%2Btag%40x.io")
  })

  it("returns emailInUse when the API throws a CONFLICT", async () => {
    mockSignUp.mockRejectedValueOnce(
      new TRPCClientError("Email already in use", {
        result: { data: { code: "CONFLICT" } } as never,
      } as never),
    )
    const result = await signUpAction({
      email: "u@x.io",
      password: "strong-password-1",
    })
    expect(result).toEqual({ ok: false, errorCode: "emailInUse" })
  })

  it("returns weakPassword when the API throws a BAD_REQUEST", async () => {
    mockSignUp.mockRejectedValueOnce(
      new TRPCClientError("Password too weak", {
        result: { data: { code: "BAD_REQUEST" } } as never,
      } as never),
    )
    const result = await signUpAction({
      email: "u@x.io",
      password: "weak",
    })
    expect(result).toEqual({ ok: false, errorCode: "weakPassword" })
  })

  it("returns fallback for unknown TRPCClientError shapes", async () => {
    mockSignUp.mockRejectedValueOnce(
      new TRPCClientError("Internal server error", {
        result: { data: { code: "INTERNAL_SERVER_ERROR" } } as never,
      } as never),
    )
    const result = await signUpAction({
      email: "u@x.io",
      password: "strong-password-1",
    })
    expect(result).toEqual({ ok: false, errorCode: "fallback" })
  })

  it("returns fallback for non-TRPC exceptions (network down, etc.)", async () => {
    mockSignUp.mockRejectedValueOnce(new Error("network down"))
    const result = await signUpAction({
      email: "u@x.io",
      password: "strong-password-1",
    })
    expect(result).toEqual({ ok: false, errorCode: "fallback" })
  })

  it("forwards the request's accept-language to the API", async () => {
    mockHeaders.mockReturnValueOnce({
      get: (_n: string) => "fr-CA,fr;q=0.9",
    })
    await expect(
      signUpAction({ email: "u@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:")
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ localePreference: "fr" }),
    )
  })

  it("forwards the runtime app URL so confirmation links match the host", async () => {
    mockGetRequestAppUrl.mockResolvedValueOnce("http://10.0.0.5:3000")
    await expect(
      signUpAction({ email: "u@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:")
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ appUrl: "http://10.0.0.5:3000" }),
    )
  })

  it("includes the optional displayName in the API call when provided", async () => {
    await expect(
      signUpAction({
        email: "u@x.io",
        password: "strong-password-1",
        displayName: "Test User",
      }),
    ).rejects.toThrow("__redirect__:")
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Test User" }),
    )
  })

  it("fires notifySignedIn + consumePending only when auto-confirm yields a session", async () => {
    mockSignUp.mockResolvedValueOnce({
      needsEmailVerification: false,
      email: "u@x.io",
    })
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: "tok" }, user: { id: "u1" } },
      error: null,
    })
    await expect(
      signUpAction({ email: "u@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:/account")
    expect(mockNotifySignedIn).toHaveBeenCalledWith({ trustedDeviceId: "td-1" })
    expect(mockConsumePending).toHaveBeenCalledTimes(1)
  })

  it("skips notifySignedIn when auto-sign-in fails (verification still pending)", async () => {
    mockSignUp.mockResolvedValueOnce({
      needsEmailVerification: true,
      email: "u@x.io",
    })
    // signInWithPassword fails because the email isn't confirmed yet
    // — the check-email page handles this state.
    await expect(
      signUpAction({ email: "u@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:/signup/check-email")
    expect(mockNotifySignedIn).not.toHaveBeenCalled()
    expect(mockConsumePending).not.toHaveBeenCalled()
  })

  it("swallows a notifySignedIn failure (best-effort emit)", async () => {
    mockSignUp.mockResolvedValueOnce({
      needsEmailVerification: false,
      email: "u@x.io",
    })
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: "tok" } },
      error: null,
    })
    mockNotifySignedIn.mockRejectedValueOnce(new Error("boom"))
    await expect(
      signUpAction({ email: "u@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:/account")
  })

  it("swallows a consumePending failure (best-effort)", async () => {
    mockSignUp.mockResolvedValueOnce({
      needsEmailVerification: false,
      email: "u@x.io",
    })
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: "tok" } },
      error: null,
    })
    mockConsumePending.mockRejectedValueOnce(new Error("boom"))
    await expect(
      signUpAction({ email: "u@x.io", password: "strong-password-1" }),
    ).rejects.toThrow("__redirect__:/account")
  })
})
