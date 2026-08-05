import { getDb } from "@monark/db";
import {
  type Paginated,
  type PaginationArgs,
  cursorFindArgs,
  resolveLimit,
  toPage,
} from "@monark/common/pagination";
import type {
  ChatMessageAuthorType,
  ChatToolCallStatus,
  ConversationKind,
  ConversationSummary,
  MessageView,
  ToolCallView,
} from "../contracts";

// Data layer for the chat substrate. Everything is org-scoped; a conversation
// is only reachable by a user who participates in it (enforced here + by the
// router's permission gate). Message content and tool inputs/outputs are stored
// verbatim so a conversation can be replayed to the model and audited.

// How many trailing messages of a conversation the agent replays as context.
// Bounds the token cost + the DB read; older turns fall out of the window.
const AGENT_HISTORY_WINDOW = 40;

const CONVERSATION_SUMMARY_SELECT = {
  id: true,
  kind: true,
  title: true,
  createdById: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const TOOL_CALL_SELECT = {
  id: true,
  toolCallRef: true,
  toolName: true,
  input: true,
  status: true,
  mutates: true,
  result: true,
  errorMessage: true,
} as const;

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  authorType: true,
  authorUserId: true,
  content: true,
  createdAt: true,
  toolCalls: { select: TOOL_CALL_SELECT, orderBy: { createdAt: "asc" } as const },
} as const;

type ToolCallRow = {
  id: string;
  toolCallRef: string;
  toolName: string;
  input: unknown;
  status: string;
  mutates: boolean;
  result: unknown;
  errorMessage: string | null;
};

type MessageRow = {
  id: string;
  conversationId: string;
  authorType: string;
  authorUserId: string | null;
  content: string;
  createdAt: Date;
  toolCalls: ToolCallRow[];
};

function toToolCallView(row: ToolCallRow): ToolCallView {
  return {
    id: row.id,
    toolCallRef: row.toolCallRef,
    toolName: row.toolName,
    input: row.input,
    status: row.status as ChatToolCallStatus,
    mutates: row.mutates,
    result: row.result ?? null,
    errorMessage: row.errorMessage,
  };
}

function toMessageView(row: MessageRow): MessageView {
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorType: row.authorType as ChatMessageAuthorType,
    authorUserId: row.authorUserId,
    content: row.content,
    createdAt: row.createdAt,
    toolCalls: row.toolCalls.map(toToolCallView),
  };
}

// ── Conversations ────────────────────────────────────────

// Conversations the user participates in, newest activity first. Scoped to the
// org and to conversations the user is (or was) a participant of.
export async function listConversations(
  organizationId: string,
  userId: string,
  args: PaginationArgs,
): Promise<Paginated<ConversationSummary>> {
  const db = getDb();
  const limit = resolveLimit(args.limit);
  const where = {
    organizationId,
    deletedAt: null,
    participants: { some: { userId, leftAt: null } },
  };
  const [rows, total] = await Promise.all([
    db.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      select: CONVERSATION_SUMMARY_SELECT,
      ...cursorFindArgs(limit, args.cursor),
    }),
    db.conversation.count({ where }),
  ]);
  return toPage(
    rows.map((r) => ({ ...r, kind: r.kind as ConversationKind })),
    total,
    limit,
  );
}

// Returns the conversation summary if the user participates in it, else null
// (used as the access gate for message reads/writes).
export async function getConversationForUser(
  organizationId: string,
  conversationId: string,
  userId: string,
): Promise<ConversationSummary | null> {
  const db = getDb();
  const row = await db.conversation.findFirst({
    where: {
      id: conversationId,
      organizationId,
      deletedAt: null,
      participants: { some: { userId, leftAt: null } },
    },
    select: CONVERSATION_SUMMARY_SELECT,
  });
  return row ? { ...row, kind: row.kind as ConversationKind } : null;
}

// Create a conversation. For an AI_ASSISTANT conversation the creator is added
// as a USER participant plus a single AI_AGENT participant; human<->human kinds
// add only the creator here (other members join separately, a later build).
export async function createConversation(input: {
  organizationId: string;
  userId: string;
  kind?: ConversationKind;
  title?: string | null;
}): Promise<ConversationSummary> {
  const db = getDb();
  const kind: ConversationKind = input.kind ?? "AI_ASSISTANT";
  const participants: Array<{ participantType: "USER" | "AI_AGENT"; userId: string | null }> = [
    { participantType: "USER", userId: input.userId },
  ];
  if (kind === "AI_ASSISTANT") {
    participants.push({ participantType: "AI_AGENT", userId: null });
  }
  const row = await db.conversation.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.userId,
      kind,
      title: input.title ?? null,
      participants: { create: participants },
    },
    select: CONVERSATION_SUMMARY_SELECT,
  });
  return { ...row, kind: row.kind as ConversationKind };
}

// Rename / soft-delete helpers.
export async function renameConversation(
  organizationId: string,
  conversationId: string,
  title: string | null,
): Promise<void> {
  const db = getDb();
  await db.conversation.updateMany({
    where: { id: conversationId, organizationId },
    data: { title },
  });
}

export async function softDeleteConversation(
  organizationId: string,
  conversationId: string,
): Promise<boolean> {
  const db = getDb();
  const res = await db.conversation.updateMany({
    where: { id: conversationId, organizationId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return res.count > 0;
}

// Set a conversation's title only when it has none yet (used to auto-title from
// the first user message). Returns the applied title, or null if left as-is.
export async function ensureConversationTitle(
  organizationId: string,
  conversationId: string,
  candidate: string,
): Promise<string | null> {
  const db = getDb();
  const title = candidate.trim().slice(0, 80);
  if (!title) return null;
  const res = await db.conversation.updateMany({
    where: { id: conversationId, organizationId, title: null },
    data: { title },
  });
  return res.count > 0 ? title : null;
}

// ── Messages ─────────────────────────────────────────────

export async function listMessages(
  organizationId: string,
  conversationId: string,
  args: PaginationArgs,
): Promise<Paginated<MessageView>> {
  const db = getDb();
  const limit = resolveLimit(args.limit);
  const where = { organizationId, conversationId };
  const [rows, total] = await Promise.all([
    db.message.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: MESSAGE_SELECT,
      ...cursorFindArgs(limit, args.cursor),
    }),
    db.message.count({ where }),
  ]);
  return toPage(
    (rows as MessageRow[]).map(toMessageView),
    total,
    limit,
  );
}

// The trailing window of a conversation, oldest-first, for replaying to the
// model. Fetches newest-first then reverses so we keep the most recent turns.
export async function loadAgentHistory(
  organizationId: string,
  conversationId: string,
): Promise<MessageView[]> {
  const db = getDb();
  const rows = (await db.message.findMany({
    where: { organizationId, conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: MESSAGE_SELECT,
    take: AGENT_HISTORY_WINDOW,
  })) as MessageRow[];
  return rows.reverse().map(toMessageView);
}

export async function appendMessage(input: {
  organizationId: string;
  conversationId: string;
  authorType: ChatMessageAuthorType;
  authorUserId?: string | null;
  content?: string;
}): Promise<MessageView> {
  const db = getDb();
  const row = (await db.message.create({
    data: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      authorType: input.authorType,
      authorUserId: input.authorUserId ?? null,
      content: input.content ?? "",
    },
    select: MESSAGE_SELECT,
  })) as MessageRow;
  await db.conversation.update({
    where: { id: input.conversationId },
    data: { lastMessageAt: new Date() },
  });
  return toMessageView(row);
}

// ── Tool calls ───────────────────────────────────────────

export async function recordToolCall(input: {
  organizationId: string;
  messageId: string;
  toolCallRef: string;
  toolName: string;
  input: unknown;
  mutates: boolean;
  status: ChatToolCallStatus;
}): Promise<ToolCallView> {
  const db = getDb();
  const row = (await db.messageToolCall.create({
    data: {
      organizationId: input.organizationId,
      messageId: input.messageId,
      toolCallRef: input.toolCallRef,
      toolName: input.toolName,
      input: input.input as object,
      mutates: input.mutates,
      status: input.status,
    },
    select: TOOL_CALL_SELECT,
  })) as ToolCallRow;
  return toToolCallView(row);
}

export async function getToolCall(
  organizationId: string,
  id: string,
): Promise<(ToolCallView & { messageId: string; conversationId: string }) | null> {
  const db = getDb();
  const row = await db.messageToolCall.findFirst({
    where: { id, organizationId },
    select: { ...TOOL_CALL_SELECT, messageId: true, message: { select: { conversationId: true } } },
  });
  if (!row) return null;
  const base = toToolCallView(row as ToolCallRow);
  return {
    ...base,
    messageId: (row as { messageId: string }).messageId,
    conversationId: (row as { message: { conversationId: string } }).message.conversationId,
  };
}

export async function updateToolCallStatus(input: {
  organizationId: string;
  id: string;
  status: ChatToolCallStatus;
  result?: unknown;
  errorMessage?: string | null;
}): Promise<void> {
  const db = getDb();
  await db.messageToolCall.updateMany({
    where: { id: input.id, organizationId: input.organizationId },
    data: {
      status: input.status,
      ...(input.result !== undefined ? { result: input.result as object } : {}),
      ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
    },
  });
}
