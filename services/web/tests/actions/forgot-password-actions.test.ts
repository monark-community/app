import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`__redirect__:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

const mockResetPasswordForEmail = vi.fn(async () => ({ data: null, error: null }));
const mockVerifyOtp = vi.fn(async () => ({
  data: {
    user: { id: "u1", email: "u@x.io" },
    session: { access_token: "tok" },
  },
  error: null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      resetPasswordForEmail: (email: string, opts: { redirectTo: string }) =>
        mockResetPasswordForEmail(email, opts),
      verifyOtp: (input: { type: string; email: string; token: string }) => mockVerifyOtp(input),
    },
  }),
}));

const mockGetRequestAppUrl = vi.fn(async () => "https://monark.app");
vi.mock("@/lib/request-app-url", () => ({
  getRequestAppUrl: () => mockGetRequestAppUrl(),
}));

import {
  requestPasswordResetAction,
  verifyRecoveryOtpAction,
} from "@/app/(anon)/forgot-password/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockResetPasswordForEmail.mockResolvedValue({ data: null, error: null });
  mockVerifyOtp.mockResolvedValue({
    data: {
      user: { id: "u1", email: "u@x.io" },
      session: { access_token: "tok" },
    },
    error: null,
  });
  mockGetRequestAppUrl.mockResolvedValue("https://monark.app");
});

describe("requestPasswordResetAction", () => {
  it("returns ok for a valid email and triggers the Supabase send", async () => {
    const result = await requestPasswordResetAction({ email: "u@x.io" });
    expect(result).toEqual({ ok: true });
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("u@x.io", {
      redirectTo: "https://monark.app/auth/confirm?type=recovery",
    });
  });

  it("returns ok without sending when the email field is empty", async () => {
    // Don't expose "no account" — return ok regardless. Saves an
    // upstream call when the input is obviously bad.
    const result = await requestPasswordResetAction({ email: "" });
    expect(result).toEqual({ ok: true });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("returns ok without sending when the email lacks an @", async () => {
    const result = await requestPasswordResetAction({ email: "not-an-email" });
    expect(result).toEqual({ ok: true });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("trims + lowercases the email before sending", async () => {
    await requestPasswordResetAction({ email: "  Mixed@CASE.io  " });
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("mixed@case.io", expect.any(Object));
  });

  it("uses the runtime Host header to build the redirectTo URL", async () => {
    mockGetRequestAppUrl.mockResolvedValueOnce("http://10.0.0.5:3000");
    await requestPasswordResetAction({ email: "u@x.io" });
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("u@x.io", {
      redirectTo: "http://10.0.0.5:3000/auth/confirm?type=recovery",
    });
  });

  it("swallows transport errors so attackers can't enumerate accounts", async () => {
    mockResetPasswordForEmail.mockRejectedValueOnce(new Error("network down"));
    // Action still resolves ok ; the error doesn't leak.
    const result = await requestPasswordResetAction({ email: "u@x.io" });
    expect(result).toEqual({ ok: true });
  });
});

describe("verifyRecoveryOtpAction", () => {
  it("redirects to /auth/reset-password on a valid code", async () => {
    await expect(verifyRecoveryOtpAction({ email: "u@x.io", token: "123456" })).rejects.toThrow(
      "__redirect__:/auth/reset-password",
    );
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      email: "u@x.io",
      token: "123456",
    });
  });

  it("returns missing when the email is empty", async () => {
    const result = await verifyRecoveryOtpAction({ email: "", token: "123456" });
    expect(result).toEqual({ ok: false, errorCode: "missing" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns missing when the token is empty", async () => {
    const result = await verifyRecoveryOtpAction({ email: "u@x.io", token: "" });
    expect(result).toEqual({ ok: false, errorCode: "missing" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns invalidCode when Supabase reports an error", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid or expired token" },
    });
    const result = await verifyRecoveryOtpAction({
      email: "u@x.io",
      token: "999999",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
  });

  it("returns invalidCode when Supabase succeeds but no session is minted", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: null,
    });
    const result = await verifyRecoveryOtpAction({
      email: "u@x.io",
      token: "123456",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
  });

  it("trims whitespace + lowercases the email before verifying", async () => {
    await expect(
      verifyRecoveryOtpAction({
        email: "  Mixed@CASE.io  ",
        token: "  123456  ",
      }),
    ).rejects.toThrow("__redirect__:/auth/reset-password");
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      email: "mixed@case.io",
      token: "123456",
    });
  });
});
