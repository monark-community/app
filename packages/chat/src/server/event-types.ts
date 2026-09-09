import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions for the webhook subscription picker. Registering
// these makes the chat domain events webhook-subscribable. IMPORTANT: events
// carry ids + org + actor only — never message content or tool inputs/outputs.
const CHAT_EVENT_TYPES = {
  "chat.conversation-created": {
    description: "A new conversation was created (an AI-assistant thread or a human conversation).",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization the conversation belongs to.",
      },
      { key: "conversationId", type: "string", description: "The new conversation's id." },
      { key: "kind", type: "string", description: "AI_ASSISTANT, DIRECT, or GROUP." },
      { key: "actorId", type: "string", description: "The user who created the conversation." },
    ],
  },
  "chat.message-created": {
    description: "A message was added to a conversation. The content is never included.",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization the message belongs to.",
      },
      { key: "conversationId", type: "string", description: "The conversation the message is in." },
      { key: "messageId", type: "string", description: "The new message's id." },
      { key: "authorType", type: "string", description: "USER, AI_AGENT, or TOOL." },
      {
        key: "actorId",
        type: "string",
        description: "The human author, or null for AI_AGENT / TOOL.",
      },
    ],
  },
  "chat.assistant-name-changed": {
    description:
      "An admin renamed the organization's AI assistant (or cleared the override back to the deploy default).",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization that was rebranded.",
      },
      {
        key: "assistantName",
        type: "string",
        description: "The new name, or null when the override was cleared.",
      },
      { key: "actorId", type: "string", description: "The admin who made the change." },
    ],
  },
} as const;

export function registerChatEventTypes(): void {
  registerEventTypes("chat", CHAT_EVENT_TYPES);
}
