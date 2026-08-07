import { z } from "zod";
import { defineNode } from "@monark/automation/server";
import { pickString, requireCredentials, twitterCall } from "../client";

const TWITTER_ICON = "Twitter";
const TWITTER_CATEGORY = "twitter";

/** The `data` object off an X v2 `{ data }` response, or `{}`. */
function dataOf(result: unknown): Record<string, unknown> {
  if (result && typeof result === "object") {
    const d = (result as { data?: unknown }).data;
    if (d && typeof d === "object") return d as Record<string, unknown>;
  }
  return {};
}

/** Post a tweet. */
export const twitterPostTweetNode = defineNode({
  descriptor: {
    kind: "action",
    category: TWITTER_CATEGORY,
    label: "X: Post tweet",
    description: "Post a tweet from the connected X account.",
    icon: TWITTER_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "tweetId", type: "string", description: "The posted tweet's id." },
      { key: "text", type: "string", description: "The posted text." },
    ],
    configFields: [
      {
        key: "text",
        label: "Text",
        type: "textarea",
        required: true,
        help: "Up to 280 characters (or your account's limit).",
      },
    ],
  },
  configSchema: z.object({ text: z.unknown().optional() }),
  execute: async (ctx, config) => {
    const credentials = await requireCredentials(ctx);
    const text = String(config.text ?? "").trim();
    if (!text) throw new Error("Tweet text is required.");
    const result = await twitterCall({
      credentials,
      method: "POST",
      path: "/2/tweets",
      body: { text },
    });
    const data = dataOf(result);
    return { tweetId: pickString(data, "id"), text: pickString(data, "text") };
  },
});

/** Reply to an existing tweet. */
export const twitterReplyNode = defineNode({
  descriptor: {
    kind: "action",
    category: TWITTER_CATEGORY,
    label: "X: Reply to tweet",
    description: "Post a reply to an existing tweet.",
    icon: TWITTER_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [{ key: "tweetId", type: "string", description: "The reply tweet's id." }],
    configFields: [
      {
        key: "inReplyToTweetId",
        label: "In reply to tweet ID",
        type: "text",
        required: true,
        placeholder: "1234567890123456789",
      },
      { key: "text", label: "Text", type: "textarea", required: true },
    ],
  },
  configSchema: z.object({
    inReplyToTweetId: z.string(),
    text: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const credentials = await requireCredentials(ctx);
    const text = String(config.text ?? "").trim();
    if (!text) throw new Error("Reply text is required.");
    const inReplyTo = config.inReplyToTweetId.trim();
    if (!inReplyTo) throw new Error("A tweet ID to reply to is required.");
    const result = await twitterCall({
      credentials,
      method: "POST",
      path: "/2/tweets",
      body: { text, reply: { in_reply_to_tweet_id: inReplyTo } },
    });
    return { tweetId: pickString(dataOf(result), "id") };
  },
});

/** Delete a tweet. */
export const twitterDeleteTweetNode = defineNode({
  descriptor: {
    kind: "action",
    category: TWITTER_CATEGORY,
    label: "X: Delete tweet",
    description: "Delete a tweet the connected account owns.",
    icon: TWITTER_ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "deleted", type: "boolean", description: "Whether the tweet was deleted." },
    ],
    configFields: [
      {
        key: "tweetId",
        label: "Tweet ID",
        type: "text",
        required: true,
        placeholder: "1234567890123456789",
      },
    ],
  },
  configSchema: z.object({ tweetId: z.string() }),
  execute: async (ctx, config) => {
    const credentials = await requireCredentials(ctx);
    const tweetId = config.tweetId.trim();
    if (!tweetId) throw new Error("A tweet ID is required.");
    const result = await twitterCall({
      credentials,
      method: "DELETE",
      path: `/2/tweets/${encodeURIComponent(tweetId)}`,
    });
    return { deleted: dataOf(result).deleted === true };
  },
});
