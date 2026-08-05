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

export type ChatEvents = ChatConversationCreatedEvent | ChatMessageCreatedEvent;
