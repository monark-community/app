import { registerAutomationNodes } from "@monark/automation/server";
import { twitterDeleteTweetNode, twitterPostTweetNode, twitterReplyNode } from "./tweets";

let registered = false;

/**
 * Register the X (Twitter) action nodes under the `twitter` namespace, exactly
 * like Core's `registerBuiltinAutomationNodes`. Called once at api boot.
 * Idempotent.
 */
export function registerTwitterAutomationNodes(): void {
  if (registered) return;
  registered = true;
  registerAutomationNodes("twitter", {
    "post-tweet": twitterPostTweetNode,
    reply: twitterReplyNode,
    "delete-tweet": twitterDeleteTweetNode,
  });
}
