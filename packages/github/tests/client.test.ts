import { afterEach, describe, expect, it, vi } from "vitest";

// The GitHub REST wrapper over the shared integration client. `safeFetch` is
// mocked to exercise the call path (auth + api.github.com base) and error
// propagation without touching the network.

const { mockSafeFetch } = vi.hoisted(() => ({ mockSafeFetch: vi.fn() }));
vi.mock("@monark/common/http", () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}));

import { githubRequest } from "../src/server/client";

type FakeRes = { ok: boolean; status: number; statusText: string; text: () => Promise<string> };
const res = (o: Partial<FakeRes> & { body?: string }): FakeRes => ({
  ok: o.ok ?? true,
  status: o.status ?? 200,
  statusText: o.statusText ?? "",
  text: async () => o.body ?? "",
});

afterEach(() => vi.clearAllMocks());

describe("githubRequest", () => {
  it("makes an authenticated call to the GitHub API and returns parsed JSON", async () => {
    mockSafeFetch.mockResolvedValue(res({ body: JSON.stringify({ number: 7 }) }));
    const out = await githubRequest({
      token: "ghp",
      method: "POST",
      path: "/repos/o/r/issues",
      body: { title: "x" },
    });
    expect(out).toEqual({ number: 7 });
    const [url, opts] = mockSafeFetch.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(url).toBe("https://api.github.com/repos/o/r/issues");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer ghp");
  });

  it("throws with GitHub's message on a non-2xx", async () => {
    mockSafeFetch.mockResolvedValue(
      res({ ok: false, status: 404, body: JSON.stringify({ message: "Not Found" }) }),
    );
    await expect(githubRequest({ token: "t", method: "GET", path: "/repos/o/r" })).rejects.toThrow(
      /404.*Not Found/,
    );
  });
});
