import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`__redirect__:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

const mockRequestConfirmationResend = vi.fn(async () => ({
  ok: true,
  remaining: 4,
}));
const mockMarkOwnEmailVerified = vi.fn(async () => {});
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_t?: string) => ({
    auth: {
      requestConfirmationResend: {
        mutate: (i: { email: string; appUrl?: string }) => mockRequestConfirmationResend(i),
      },
      markOwnEmailVerified: { mutate: () => mockMarkOwnEmailVerified() },
    },
  }),
}));

const mockGetRequestAppUrl = vi.fn(async () => "https://monark.app");
vi.mock("@/lib/request-app-url", () => ({
  getRequestAppUrl: () => mockGetRequestAppUrl(),
}));

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
      verifyOtp: (i: { type: string; email: string; token: string }) => mockVerifyOtp(i),
    },
  }),
}));

const mockRecognize = vi.fn(async (_t: string) => "td-1");
vi.mock("@/lib/trusted-device-cookie", () => ({
  recognizeDeviceAfterAuth: (t: string) => mockRecognize(t),
}));

import { resendConfirmationAction, verifyOtpAction } from "@/app/(anon)/signup/check-email/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequestConfirmationResend.mockResolvedValue({ ok: true, remaining: 4 });
  mockGetRequestAppUrl.mockResolvedValue("https://monark.app");
  mockVerifyOtp.mockResolvedValue({
    data: {
      user: { id: "u1", email: "u@x.io" },
      session: { access_token: "tok" },
    },
    error: null,
  });
});

describe("resendConfirmationAction", () => {
  it("returns ok with remaining count on a successful resend", async () => {
    const result = await resendConfirmationAction("u@x.io");
    expect(result).toEqual({ ok: true, remaining: 4 });
    expect(mockRequestConfirmationResend).toHaveBeenCalledWith({
      email: "u@x.io",
      appUrl: "https://monark.app",
    });
  });

  it("returns missingEmail when the email is empty", async () => {
    const result = await resendConfirmationAction("");
    expect(result).toEqual({ ok: false, errorCode: "missingEmail" });
    expect(mockRequestConfirmationResend).not.toHaveBeenCalled();
  });

  it("forwards the runtime app URL so the resent email lands on the right host", async () => {
    mockGetRequestAppUrl.mockResolvedValueOnce("http://10.0.0.5:3000");
    await resendConfirmationAction("u@x.io");
    expect(mockRequestConfirmationResend).toHaveBeenCalledWith({
      email: "u@x.io",
      appUrl: "http://10.0.0.5:3000",
    });
  });

  it("returns upstream when the API throws", async () => {
    mockRequestConfirmationResend.mockRejectedValueOnce(new Error("network"));
    const result = await resendConfirmationAction("u@x.io");
    expect(result).toEqual({ ok: false, errorCode: "upstream" });
  });

  it("propagates the API's error code (alreadyVerified) when it returns one", async () => {
    mockRequestConfirmationResend.mockResolvedValueOnce({
      ok: false,
      errorCode: "alreadyVerified",
    });
    const result = await resendConfirmationAction("u@x.io");
    expect(result).toEqual({ ok: false, errorCode: "alreadyVerified" });
  });

  it("propagates the API's error code (exhausted) with retry-after seconds", async () => {
    mockRequestConfirmationResend.mockResolvedValueOnce({
      ok: false,
      errorCode: "exhausted",
      retryAfterSeconds: 30,
    });
    const result = await resendConfirmationAction("u@x.io");
    expect(result).toEqual({
      ok: false,
      errorCode: "exhausted",
      retryAfterSeconds: 30,
    });
  });
});

describe("verifyOtpAction", () => {
  it("redirects to /account on a valid signup OTP", async () => {
    await expect(verifyOtpAction({ email: "u@x.io", token: "123456" })).rejects.toThrow(
      "__redirect__:/account",
    );
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: "signup",
      email: "u@x.io",
      token: "123456",
    });
    expect(mockMarkOwnEmailVerified).toHaveBeenCalled();
    expect(mockRecognize).toHaveBeenCalledWith("tok");
  });

  it("returns invalidCode when the email is empty", async () => {
    const result = await verifyOtpAction({ email: "", token: "123456" });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("returns invalidCode when the token is empty", async () => {
    const result = await verifyOtpAction({ email: "u@x.io", token: "" });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
  });

  it("returns invalidCode when Supabase reports an error", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "Invalid token" },
    });
    const result = await verifyOtpAction({
      email: "u@x.io",
      token: "999999",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
  });

  it("returns invalidCode when no session is minted (race / partial)", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: { user: { id: "u1" }, session: null },
      error: null,
    });
    const result = await verifyOtpAction({
      email: "u@x.io",
      token: "123456",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
  });

  it("trims whitespace on the email + token before verifying", async () => {
    await expect(
      verifyOtpAction({
        email: "  u@x.io  ",
        token: "  123456  ",
      }),
    ).rejects.toThrow("__redirect__:/account");
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      type: "signup",
      email: "u@x.io",
      token: "123456",
    });
  });

  it("swallows a markOwnEmailVerified failure (shadow-table is best-effort)", async () => {
    mockMarkOwnEmailVerified.mockRejectedValueOnce(new Error("upstream"));
    await expect(verifyOtpAction({ email: "u@x.io", token: "123456" })).rejects.toThrow(
      "__redirect__:/account",
    );
    // The redirect still fires + the trusted-device recognition still
    // runs (auth.users is the source of truth, the shadow row is a
    // mirror).
    expect(mockRecognize).toHaveBeenCalled();
  });
});
