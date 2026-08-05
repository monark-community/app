import { registerPermissions } from "@monark/rbac/server";

// Permissions owned by the chat module. `use` gates access to the chat surface
// (read one's conversations + send messages / talk to the agent). `manage` is
// reserved for org-wide moderation (view/delete others' conversations) — a
// later build; registered now so the capability exists. Built-in ADMIN /
// SYSADMIN short-circuit both.
//
// Note: individual TOOL actions the agent takes are NOT gated here — they run
// through the app's own tRPC procedures under the user's session, so each tool
// is already gated by that procedure's own permission (e.g. records write needs
// data-models.record-write). Chat adds no bypass.
const CHAT_PERMISSIONS = {
  use: {
    description:
      "Use chat: view your own conversations and send messages, including talking to the AI assistant.",
    category: "chat",
  },
  manage: {
    description: "Moderate chat across the organization (view and remove any conversation).",
    category: "chat",
  },
} as const;

export function registerChatPermissions(): void {
  registerPermissions("chat", CHAT_PERMISSIONS);
}
