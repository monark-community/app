import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the chat module. The messaging surface and the AI
// agent are gated separately so the conversation UI could ship before (or
// without) the agent, and so an operator can kill the LLM-backed agent per-org
// while leaving human conversations intact. Both default OFF for the initial
// rollout; flip on per-org / globally from /admin/feature-flags.
const CHAT_FLAGS = {
  enabled: {
    description: "Enable the Chat module: conversations UI + the message substrate.",
    defaultOn: false,
  },
  "ai-agent": {
    description:
      "Enable the app-owned AI agent inside chat (LLM-backed replies + tool use). Requires chat.enabled.",
    defaultOn: false,
  },
} as const;

export function registerChatFeatureFlags(): void {
  registerFlags("chat", CHAT_FLAGS);
}
