import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`__redirect__:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

const mockGetSession = vi.fn(async () => ({
  data: { session: { access_token: "tok" } },
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getSession: () => mockGetSession() },
  }),
}));

const mockReadTotpPending = vi.fn(async () => ({
  pending: true,
  trustedDeviceId: "td-1",
}));
const mockClearTotpPending = vi.fn(async () => {});
vi.mock("@/lib/totp-pending-cookie", () => ({
  readTotpPending: () => mockReadTotpPending(),
  clearTotpPending: () => mockClearTotpPending(),
}));

const mockVerifyCode = vi.fn(async () => ({ ok: true }));
const mockVerifyRecoveryCode = vi.fn(async () => ({ ok: true }));
const mockNotifySignedIn = vi.fn(async () => {});
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_t?: string) => ({
    auth: {
      totp: {
        verifyCode: {
          mutate: (i: { code: string; trustedDeviceId: string | null }) => mockVerifyCode(i),
        },
        verifyRecoveryCode: {
          mutate: (i: { code: string; trustedDeviceId: string | null }) =>
            mockVerifyRecoveryCode(i),
        },
      },
      notifySignedIn: { mutate: (i?: unknown) => mockNotifySignedIn(i) },
    },
  }),
}));

import { verifyTotpChallengeAction } from "@/app/(anon)/signin/totp/actions";

beforeEach(() => {
  vi.clearAllMocks();
  mockReadTotpPending.mockResolvedValue({ pending: true, trustedDeviceId: "td-1" });
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "tok" } },
  });
  mockVerifyCode.mockResolvedValue({ ok: true });
  mockVerifyRecoveryCode.mockResolvedValue({ ok: true });
});

describe("verifyTotpChallengeAction (totp mode)", () => {
  it("redirects to /account on a valid code", async () => {
    await expect(verifyTotpChallengeAction({ code: "123456", mode: "totp" })).rejects.toThrow(
      "__redirect__:/account",
    );
    expect(mockVerifyCode).toHaveBeenCalledWith({
      code: "123456",
      trustedDeviceId: "td-1",
    });
    expect(mockNotifySignedIn).toHaveBeenCalledWith({
      trustedDeviceId: "td-1",
    });
    expect(mockClearTotpPending).toHaveBeenCalled();
  });

  it("returns expired when no pending challenge cookie is set", async () => {
    mockReadTotpPending.mockResolvedValueOnce({
      pending: false,
      trustedDeviceId: null,
    });
    const result = await verifyTotpChallengeAction({
      code: "123456",
      mode: "totp",
    });
    expect(result).toEqual({ ok: false, errorCode: "expired" });
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it("returns expired when the Supabase session has no access token", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    const result = await verifyTotpChallengeAction({
      code: "123456",
      mode: "totp",
    });
    expect(result).toEqual({ ok: false, errorCode: "expired" });
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it("returns invalidCode when verifyCode reports !ok", async () => {
    mockVerifyCode.mockResolvedValueOnce({ ok: false });
    const result = await verifyTotpChallengeAction({
      code: "999999",
      mode: "totp",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
    expect(mockNotifySignedIn).not.toHaveBeenCalled();
    expect(mockClearTotpPending).not.toHaveBeenCalled();
  });

  it("returns invalidCode when verifyCode throws", async () => {
    mockVerifyCode.mockRejectedValueOnce(new Error("upstream"));
    const result = await verifyTotpChallengeAction({
      code: "123456",
      mode: "totp",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
  });

  it("forwards a null trustedDeviceId when the pending cookie has none", async () => {
    mockReadTotpPending.mockResolvedValueOnce({
      pending: true,
      trustedDeviceId: null,
    });
    await expect(verifyTotpChallengeAction({ code: "123456", mode: "totp" })).rejects.toThrow(
      "__redirect__:/account",
    );
    expect(mockVerifyCode).toHaveBeenCalledWith({
      code: "123456",
      trustedDeviceId: null,
    });
    // notifySignedIn fires without the optional arg.
    expect(mockNotifySignedIn).toHaveBeenCalledWith(undefined);
  });

  it("swallows a notifySignedIn failure (best-effort emit)", async () => {
    mockNotifySignedIn.mockRejectedValueOnce(new Error("boom"));
    await expect(verifyTotpChallengeAction({ code: "123456", mode: "totp" })).rejects.toThrow(
      "__redirect__:/account",
    );
  });
});

describe("verifyTotpChallengeAction (recovery mode)", () => {
  it("uses the recovery-code procedure instead of the TOTP one", async () => {
    await expect(
      verifyTotpChallengeAction({ code: "abcd-efgh", mode: "recovery" }),
    ).rejects.toThrow("__redirect__:/account");
    expect(mockVerifyRecoveryCode).toHaveBeenCalledWith({
      code: "abcd-efgh",
      trustedDeviceId: "td-1",
    });
    // The TOTP procedure isn't touched in recovery mode.
    expect(mockVerifyCode).not.toHaveBeenCalled();
  });

  it("returns invalidCode when the recovery code is rejected", async () => {
    mockVerifyRecoveryCode.mockResolvedValueOnce({ ok: false });
    const result = await verifyTotpChallengeAction({
      code: "wrong-code",
      mode: "recovery",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
  });

  it("returns invalidCode when the recovery procedure throws", async () => {
    mockVerifyRecoveryCode.mockRejectedValueOnce(new Error("upstream"));
    const result = await verifyTotpChallengeAction({
      code: "abcd-efgh",
      mode: "recovery",
    });
    expect(result).toEqual({ ok: false, errorCode: "invalidCode" });
  });
});
