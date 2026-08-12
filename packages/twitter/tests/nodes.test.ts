import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ClientModule from "../src/server/client";
import type { NodeExecutionContext } from "@monark/automation/server";

// The three X action nodes (post / reply / delete), driven through their real
// `run` (config parse + execute). The client module is mocked — credentials are
// stubbed and `twitterCall` is captured — so the tests assert the request the
// node builds (method / path / body) and the output it derives, plus the
// required-text / required-id guards. `pickString` stays real.

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));
vi.mock("../src/server/client", async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>();
  return {
    ...actual,
    requireCredentials: async () => ({
      consumerKey: "ck",
      consumerSecret: "cs",
      accessToken: "at",
      accessTokenSecret: "ats",
    }),
    twitterCall: (...args: unknown[]) => mockCall(...args),
  };
});

import {
  twitterDeleteTweetNode,
  twitterPostTweetNode,
  twitterReplyNode,
} from "../src/server/nodes/tweets";

const ctx = {} as NodeExecutionContext;
const callArg = () => mockCall.mock.calls.at(-1)![0] as Record<string, unknown>;

afterEach(() => vi.clearAllMocks());

describe("twitterPostTweetNode", () => {
  it("posts the trimmed text and returns the new tweet id + text", async () => {
    mockCall.mockResolvedValue({ data: { id: "99", text: "hello world" } });
    const out = await twitterPostTweetNode.run(ctx, { text: "  hello world  " });
    expect(out).toEqual({ tweetId: "99", text: "hello world" });
    expect(callArg()).toMatchObject({
      method: "POST",
      path: "/2/tweets",
      body: { text: "hello world" },
    });
  });

  it("requires non-empty text", async () => {
    await expect(twitterPostTweetNode.run(ctx, { text: "   " })).rejects.toThrow(
      /text is required/i,
    );
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe("twitterReplyNode", () => {
  it("posts a reply threaded to the target tweet", async () => {
    mockCall.mockResolvedValue({ data: { id: "100" } });
    const out = await twitterReplyNode.run(ctx, { inReplyToTweetId: "55", text: "re" });
    expect(out).toEqual({ tweetId: "100" });
    expect(callArg().body).toEqual({ text: "re", reply: { in_reply_to_tweet_id: "55" } });
  });

  it("requires text and a target tweet id", async () => {
    await expect(twitterReplyNode.run(ctx, { inReplyToTweetId: "55", text: " " })).rejects.toThrow(
      /reply text is required/i,
    );
    await expect(twitterReplyNode.run(ctx, { inReplyToTweetId: " ", text: "hi" })).rejects.toThrow(
      /tweet id to reply to is required/i,
    );
  });
});

describe("twitterDeleteTweetNode", () => {
  it("deletes by id and reports the deleted flag", async () => {
    mockCall.mockResolvedValue({ data: { deleted: true } });
    const out = await twitterDeleteTweetNode.run(ctx, { tweetId: "77" });
    expect(out).toEqual({ deleted: true });
    expect(callArg()).toMatchObject({ method: "DELETE", path: "/2/tweets/77" });

    mockCall.mockResolvedValue({ data: { deleted: false } });
    expect(await twitterDeleteTweetNode.run(ctx, { tweetId: "77" })).toEqual({ deleted: false });
  });

  it("requires a tweet id", async () => {
    await expect(twitterDeleteTweetNode.run(ctx, { tweetId: "  " })).rejects.toThrow(
      /tweet id is required/i,
    );
  });
});
