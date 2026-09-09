import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events emitted by the chat module. gen:events picks up the ChatEvents
// union by name. Events carry ids + org + actor only — never message content or
// tool inputs/outputs (those can hold user data that shouldn't fan out to every
// webhook subscriber).

export type ChatConversationCreatedEvent = DomainEventBase & {
  type: "chat.conversation-created";
  organizationId: string;
  conversationId: string;
  kind: "AI_ASSISTANT" | "DIRECT" | "GROUP";
  actorId: string;
};

export type ChatMessageCreatedEvent = DomainEventBase & {
  type: "chat.message-created";
  organizationId: string;
  conversationId: string;
  messageId: string;
  authorType: "USER" | "AI_AGENT" | "TOOL";
  // The human author for a USER message; null for AI_AGENT / TOOL messages.
  actorId: string | null;
};

// Emitted when an admin renames (or clears) the org's AI assistant. Carries the
// new name because it's operator-chosen branding, not user data — the whole
// point of the event is letting an integration mirror the rename.
export type ChatAssistantNameChangedEvent = DomainEventBase & {
  type: "chat.assistant-name-changed";
  organizationId: string;
  actorId: string;
  // The org's new override, or null when it was cleared back to the
  // deploy-wide default.
  assistantName: string | null;
};

export type ChatEvents =
  | ChatConversationCreatedEvent
  | ChatMessageCreatedEvent
  | ChatAssistantNameChangedEvent;
