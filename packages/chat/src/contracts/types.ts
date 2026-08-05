// Shared enum unions + view shapes for the chat module, usable from both the
// server and the web client without importing Prisma. They mirror the Prisma
// enums 1:1; string literals of these unions are assignable to the generated
// Prisma enum types at write time, and Prisma's reads narrow back to them.

export type ConversationKind = "AI_ASSISTANT" | "DIRECT" | "GROUP";
export type ChatParticipantType = "USER" | "AI_AGENT";
export type ChatMessageAuthorType = "USER" | "AI_AGENT" | "TOOL";
export type ChatToolCallStatus =
  | "PROPOSED"
  | "EXECUTING"
  | "SUCCEEDED"
  | "FAILED"
  | "REJECTED";

// Optional "where the user is" hint sent with a message so the agent can
// interpret references like "this record" / "here". Never trusted for access —
// tools still enforce RBAC — it only shapes the system prompt.
export type ChatMessageContext = {
  route?: string;
  focus?: { model?: string; recordId?: string };
};

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  createdById: string;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ToolCallView = {
  id: string;
  toolCallRef: string;
  toolName: string;
  input: unknown;
  status: ChatToolCallStatus;
  mutates: boolean;
  result: unknown;
  errorMessage: string | null;
};

export type MessageView = {
  id: string;
  conversationId: string;
  authorType: ChatMessageAuthorType;
  authorUserId: string | null;
  content: string;
  createdAt: Date;
  toolCalls: ToolCallView[];
};
