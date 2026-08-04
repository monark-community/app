import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin-side user actions (/admin/users/[id]) : avatar + banner upload and the
// admin-initiated password reset. rbac is enforced in the tRPC procedures these
// call ; here we prove the action-level contract — input validation, the
// image-size / MIME gates, the auth-token check, error mapping, and that the
// reset flow never mutates the password directly (it emails the user a link).

const {
  mockSharp,
  mockSharpChain,
  mockGetSession,
  mockUpload,
  mockGetPublicUrl,
  mockResetPassword,
  mockAdminUpdateProfile,
  mockAdminGetUser,
} = vi.hoisted(() => {
  const toBuffer = vi.fn(async () => Buffer.from("processed-bytes"));
  const chain: Record<string, unknown> = {};
  chain.rotate = () => chain;
  chain.resize = () => chain;
  chain.webp = () => chain;
  chain.toBuffer = toBuffer;
  return {
    mockSharp: vi.fn(() => chain),
    mockSharpChain: chain as { toBuffer: ReturnType<typeof vi.fn> },
    mockGetSession: vi.fn(async () => ({ data: { session: { access_token: "tok" } } })),
    mockUpload: vi.fn(async () => ({ data: null, error: null })),
    mockGetPublicUrl: vi.fn(() => ({
      data: { publicUrl: "https://supabase.local/storage/v1/avatars/path" },
    })),
    mockResetPassword: vi.fn(async () => ({ data: {}, error: null })),
    mockAdminUpdateProfile: vi.fn(async () => ({ id: "u-1" })),
    mockAdminGetUser: vi.fn(async () => ({ user: { email: "target@test.local" } })),
  };
});

vi.mock("sharp", () => ({ default: mockSharp }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getSession: () => mockGetSession(),
      resetPasswordForEmail: (email: string, opts: unknown) => mockResetPassword(email, opts),
    },
    storage: {
      from: (_bucket: string) => ({
        upload: (path: string, body: unknown, opts: unknown) => mockUpload(path, body, opts),
        getPublicUrl: (path: string) => mockGetPublicUrl(path),
      }),
    },
  }),
}));
vi.mock("@/lib/trpc-server", () => ({
  createServerTrpcClient: (_t?: string) => ({
    users: {
      adminUpdateProfile: { mutate: (i: unknown) => mockAdminUpdateProfile(i) },
      adminGetUser: { query: (i: unknown) => mockAdminGetUser(i) },
    },
  }),
}));
vi.mock("@/lib/request-app-url", () => ({
  getRequestAppUrl: async () => "https://app.local",
}));

import {
  adminSendPasswordResetAction,
  adminUploadAvatarAction,
  adminUploadBannerAction,
} from "@/app/(authed)/admin/users/admin-actions";

function makeFile({ type = "image/png", size = 1024, name = "a.png" } = {}): File {
  return new File([new Uint8Array(size)], name, { type });
}
function fd(input: { file?: unknown; userId?: unknown }): FormData {
  const f = new FormData();
  if (input.file !== undefined) f.set("file", input.file as Blob | string);
  if (input.userId !== undefined) f.set("userId", input.userId as string);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSharp.mockReturnValue(mockSharpChain);
  mockSharpChain.toBuffer.mockResolvedValue(Buffer.from("processed-bytes"));
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  mockUpload.mockResolvedValue({ data: null, error: null });
  mockGetPublicUrl.mockReturnValue({
    data: { publicUrl: "https://supabase.local/storage/v1/avatars/path" },
  });
  mockAdminUpdateProfile.mockResolvedValue({ id: "u-1" });
  mockAdminGetUser.mockResolvedValue({ user: { email: "target@test.local" } });
});

describe("adminUploadAvatarAction", () => {
  it("processes, uploads under the target user's folder, and mirrors the URL", async () => {
    const res = await adminUploadAvatarAction(fd({ file: makeFile(), userId: "u-7" }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.avatarUrl).toMatch(/\?v=\d+$/);
    expect(mockUpload.mock.calls[0]![0] as string).toMatch(/^u-7\/\d+\.webp$/);
    expect(mockAdminUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-7", avatarUrl: expect.stringContaining("?v=") }),
    );
  });

  it("rejects a missing userId, missing file, bad MIME, and oversize file", async () => {
    expect(await adminUploadAvatarAction(fd({ file: makeFile() }))).toEqual({
      ok: false,
      errorCode: "upstream",
    });
    expect(await adminUploadAvatarAction(fd({ userId: "u-1" }))).toEqual({
      ok: false,
      errorCode: "invalidType",
    });
    expect(
      await adminUploadAvatarAction(fd({ file: makeFile({ type: "image/gif" }), userId: "u-1" })),
    ).toEqual({ ok: false, errorCode: "invalidType" });
    expect(mockSharp).not.toHaveBeenCalled();
    expect(
      await adminUploadAvatarAction(
        fd({ file: makeFile({ size: 3 * 1024 * 1024 }), userId: "u-1" }),
      ),
    ).toEqual({ ok: false, errorCode: "tooLarge" });
  });

  it("returns notAuthenticated when the session has no access token", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    expect(await adminUploadAvatarAction(fd({ file: makeFile(), userId: "u-1" }))).toEqual({
      ok: false,
      errorCode: "notAuthenticated",
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("maps a corrupt image (sharp throws) to invalidType", async () => {
    mockSharpChain.toBuffer.mockRejectedValueOnce(new Error("corrupt"));
    expect(await adminUploadAvatarAction(fd({ file: makeFile(), userId: "u-1" }))).toEqual({
      ok: false,
      errorCode: "invalidType",
    });
  });

  it("maps a storage upload failure to upstream and skips the profile mirror", async () => {
    mockUpload.mockResolvedValueOnce({
      data: null,
      error: { message: "RLS", name: "StorageError" },
    });
    expect(await adminUploadAvatarAction(fd({ file: makeFile(), userId: "u-1" }))).toEqual({
      ok: false,
      errorCode: "upstream",
    });
    expect(mockAdminUpdateProfile).not.toHaveBeenCalled();
  });

  it("maps a failed profile mirror to upstream", async () => {
    mockAdminUpdateProfile.mockRejectedValueOnce(new Error("db blip"));
    expect(await adminUploadAvatarAction(fd({ file: makeFile(), userId: "u-1" }))).toEqual({
      ok: false,
      errorCode: "upstream",
    });
  });
});

describe("adminUploadBannerAction", () => {
  it("uploads under <userId>/banners/ and mirrors the banner URL", async () => {
    const res = await adminUploadBannerAction(fd({ file: makeFile(), userId: "u-9" }));
    expect(res.ok).toBe(true);
    expect(mockUpload.mock.calls[0]![0] as string).toMatch(/^u-9\/banners\/\d+\.webp$/);
    expect(mockAdminUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-9", bannerUrl: expect.any(String) }),
    );
  });

  it("enforces the larger 5 MB banner cap", async () => {
    // 4 MB passes the banner cap (would fail the 2 MB avatar cap).
    expect(
      (
        await adminUploadBannerAction(
          fd({ file: makeFile({ size: 4 * 1024 * 1024 }), userId: "u-1" }),
        )
      ).ok,
    ).toBe(true);
    // 6 MB exceeds it.
    expect(
      await adminUploadBannerAction(
        fd({ file: makeFile({ size: 6 * 1024 * 1024 }), userId: "u-1" }),
      ),
    ).toEqual({
      ok: false,
      errorCode: "tooLarge",
    });
  });
});

describe("adminSendPasswordResetAction", () => {
  it("emails the user a recovery link (never mutating the password) on the happy path", async () => {
    const res = await adminSendPasswordResetAction({ userId: "u-1" });
    expect(res).toEqual({ ok: true });
    expect(mockResetPassword).toHaveBeenCalledWith(
      "target@test.local",
      expect.objectContaining({ redirectTo: "https://app.local/auth/confirm?type=recovery" }),
    );
  });

  it("returns notAuthenticated without a session token", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    expect(await adminSendPasswordResetAction({ userId: "u-1" })).toEqual({
      ok: false,
      errorCode: "notAuthenticated",
    });
    expect(mockAdminGetUser).not.toHaveBeenCalled();
  });

  it("maps rbac denials (UNAUTHORIZED / FORBIDDEN) to forbidden, other errors to upstream", async () => {
    mockAdminGetUser.mockRejectedValueOnce(
      Object.assign(new Error(), { data: { code: "UNAUTHORIZED" } }),
    );
    expect(await adminSendPasswordResetAction({ userId: "u-1" })).toEqual({
      ok: false,
      errorCode: "forbidden",
    });
    mockAdminGetUser.mockRejectedValueOnce(
      Object.assign(new Error(), { data: { code: "FORBIDDEN" } }),
    );
    expect(await adminSendPasswordResetAction({ userId: "u-1" })).toEqual({
      ok: false,
      errorCode: "forbidden",
    });
    mockAdminGetUser.mockRejectedValueOnce(new Error("network blip"));
    expect(await adminSendPasswordResetAction({ userId: "u-1" })).toEqual({
      ok: false,
      errorCode: "upstream",
    });
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("still resolves ok when the Supabase send throws (enumeration-resistant)", async () => {
    mockResetPassword.mockRejectedValueOnce(new Error("smtp down"));
    expect(await adminSendPasswordResetAction({ userId: "u-1" })).toEqual({ ok: true });
  });
});
