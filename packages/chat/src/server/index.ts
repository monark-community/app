import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { emit, NotFoundError, UnauthorizedError } from "@monark/common";
import { MAX_PAGE_SIZE } from "@monark/common/pagination";
import { isEnabled } from "@monark/feature-flags/server";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import type {
  ChatConversationCreatedEvent,
  ChatMessageCreatedEvent,
} from "../contracts";
import {
  appendMessage,
  createConversation,
  ensureConversationTitle,
  getConversationForUser,
  listConversations,
  listMessages,
  renameConversation,
  softDeleteConversation,
} from "./data";
import {
  advanceConversation,
  confirmToolCall,
  rejectToolCall,
  type AdvanceHooks,
  type AdvanceResult,
} from "./agent";
import type { ChatUserContext } from "./tools";
import { getAssistantName } from "./config";
import type { ChatMessageContext } from "../contracts";

const CHAT_ENABLED = "chat.enabled";
const CHAT_AI_AGENT = "chat.ai-agent";

const pageInput = {
  limit: z.number().int().positive().max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().nullish(),
};

// Resolve the signed-in user + active org, assert the chat surface is enabled,
// and assert `chat.use`. Returns the org id + a ctx usable by the agent loop.
async function requireChatAccess(ctx: {
  userId: string | null;
  activeOrganizationId: string | null;
  requestId?: string;
}): Promise<{ organizationId: string; userId: string; agentCtx: ChatUserContext }> {
  if (!ctx.userId) throw new UnauthorizedError();
  const org = await requireOrg({
    userId: ctx.userId,
    activeOrganizationId: ctx.activeOrganizationId,
  });
  if (!(await isEnabled(CHAT_ENABLED, { userId: ctx.userId, organizationId: org.id }))) {
    // Reveal nothing when the module is off for this principal.
    throw new NotFoundError("chat");
  }
  await requirePermission(ctx, "chat.use", org.id);
  return {
    organizationId: org.id,
    userId: ctx.userId,
    agentCtx: { userId: ctx.userId, organizationId: org.id, requestId: ctx.requestId },
  };
}

async function requireAiAgent(userId: string, organizationId: string): Promise<void> {
  if (!(await isEnabled(CHAT_AI_AGENT, { userId, organizationId }))) {
    throw new NotFoundError("chat ai agent");
  }
}

// Post a user message and run the assistant turn. Shared by the tRPC
// `messages.send` mutation (no hooks) and the Express SSE endpoint (which passes
// an `onTextDelta` hook to stream tokens). Creates the conversation when none is
// given (auto-titled from the first message). Applies the same gates as any chat
// procedure (`chat.use` + `chat.enabled`, plus `chat.ai-agent` for the LLM turn).
export async function sendMessage(
  ctx: { userId: string | null; activeOrganizationId: string | null; requestId?: string },
  input: { conversationId?: string; content: string; context?: ChatMessageContext },
  hooks?: AdvanceHooks,
): Promise<{ conversationId: string; status: AdvanceResult["status"] }> {
  const { organizationId, userId, agentCtx } = await requireChatAccess(ctx);

  let conversationId = input.conversationId;
  if (conversationId) {
    const existing = await getConversationForUser(organizationId, conversationId, userId);
    if (!existing) throw new NotFoundError("conversation", conversationId);
  } else {
    const created = await createConversation({ organizationId, userId, kind: "AI_ASSISTANT" });
    conversationId = created.id;
    const convCreated: ChatConversationCreatedEvent = {
      type: "chat.conversation-created",
      organizationId,
      conversationId,
      kind: "AI_ASSISTANT",
      actorId: userId,
      occurredAt: new Date(),
    };
    await emit(convCreated);
  }

  await requireAiAgent(userId, organizationId);

  const userMessage = await appendMessage({
    organizationId,
    conversationId,
    authorType: "USER",
    authorUserId: userId,
    content: input.content,
  });
  await ensureConversationTitle(organizationId, conversationId, input.content);
  const msgEvent: ChatMessageCreatedEvent = {
    type: "chat.message-created",
    organizationId,
    conversationId,
    messageId: userMessage.id,
    authorType: "USER",
    actorId: userId,
    occurredAt: new Date(),
  };
  await emit(msgEvent);

  const result = await advanceConversation(agentCtx, conversationId, {
    context: input.context,
    hooks,
  });
  return { conversationId, status: result.status };
}

export const chatRouter = router({
  // Lightweight branding lookup for the web companion (the assistant's display
  // name). Session-only — it isn't gated on the chat flags so the UI can resolve
  // the name regardless; the launcher/panel are hidden by the flag anyway.
  config: publicProcedure.query(({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    return { assistantName: getAssistantName() };
  }),

  conversations: router({
    list: publicProcedure.input(z.object({ ...pageInput })).query(async ({ ctx, input }) => {
      const { organizationId, userId } = await requireChatAccess(ctx);
      return listConversations(organizationId, userId, input);
    }),

    get: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
      const { organizationId, userId } = await requireChatAccess(ctx);
      const conversation = await getConversationForUser(organizationId, input.id, userId);
      if (!conversation) throw new NotFoundError("conversation", input.id);
      return conversation;
    }),

    create: publicProcedure
      .input(
        z.object({
          title: z.string().trim().max(120).nullish(),
          // v1 only mints AI-assistant threads from the UI; human kinds land later.
          kind: z.literal("AI_ASSISTANT").optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { organizationId, userId } = await requireChatAccess(ctx);
        const conversation = await createConversation({
          organizationId,
          userId,
          kind: input.kind ?? "AI_ASSISTANT",
          title: input.title ?? null,
        });
        const event: ChatConversationCreatedEvent = {
          type: "chat.conversation-created",
          organizationId,
          conversationId: conversation.id,
          kind: conversation.kind,
          actorId: userId,
          occurredAt: new Date(),
        };
        await emit(event);
        return conversation;
      }),

    rename: publicProcedure
      .input(z.object({ id: z.string().min(1), title: z.string().trim().max(120).nullable() }))
      .mutation(async ({ ctx, input }) => {
        const { organizationId, userId } = await requireChatAccess(ctx);
        const existing = await getConversationForUser(organizationId, input.id, userId);
        if (!existing) throw new NotFoundError("conversation", input.id);
        await renameConversation(organizationId, input.id, input.title);
        return { id: input.id, title: input.title };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const { organizationId, userId } = await requireChatAccess(ctx);
        const existing = await getConversationForUser(organizationId, input.id, userId);
        if (!existing) throw new NotFoundError("conversation", input.id);
        const deleted = await softDeleteConversation(organizationId, input.id);
        return { id: input.id, deleted };
      }),
  }),

  messages: router({
    list: publicProcedure
      .input(z.object({ conversationId: z.string().min(1), ...pageInput }))
      .query(async ({ ctx, input }) => {
        const { organizationId, userId } = await requireChatAccess(ctx);
        const conversation = await getConversationForUser(
          organizationId,
          input.conversationId,
          userId,
        );
        if (!conversation) throw new NotFoundError("conversation", input.conversationId);
        return listMessages(organizationId, input.conversationId, input);
      }),

    // Post a user message and run the assistant turn. When `conversationId` is
    // omitted a new AI-assistant conversation is created (auto-titled from the
    // first message). Returns the (possibly new) conversation id + the agent's
    // resulting status (done | awaiting_confirmation | max_steps).
    send: publicProcedure
      .input(
        z.object({
          conversationId: z.string().min(1).optional(),
          content: z.string().trim().min(1).max(8000),
          // Optional "where the user is" hint; shapes the system prompt only,
          // never grants access (tools still enforce RBAC).
          context: z
            .object({
              route: z.string().max(200).optional(),
              focus: z
                .object({
                  model: z.string().max(100).optional(),
                  recordId: z.string().max(100).optional(),
                })
                .optional(),
            })
            .optional(),
        }),
      )
      .mutation(({ ctx, input }) => sendMessage(ctx, input)),
  }),

  toolCalls: router({
    confirm: publicProcedure
      .input(z.object({ toolCallId: z.string().min(1) }))
      .mutation(async ({ ctx, input }): Promise<{ status: AdvanceResult["status"] }> => {
        const { userId, organizationId, agentCtx } = await requireChatAccess(ctx);
        await requireAiAgent(userId, organizationId);
        const result = await confirmToolCall(agentCtx, input.toolCallId);
        return { status: result.status };
      }),

    reject: publicProcedure
      .input(z.object({ toolCallId: z.string().min(1) }))
      .mutation(async ({ ctx, input }): Promise<{ status: AdvanceResult["status"] }> => {
        const { userId, organizationId, agentCtx } = await requireChatAccess(ctx);
        await requireAiAgent(userId, organizationId);
        const result = await rejectToolCall(agentCtx, input.toolCallId);
        return { status: result.status };
      }),
  }),
});

// ── Server-only exports for the api host ──────────────────
export { registerChatPermissions } from "./permissions";
export { registerChatEventTypes } from "./event-types";
export { registerChatFeatureFlags } from "./feature-flags";
export {
  setChatToolExecutor,
  getChatToolExecutor,
  type ChatToolExecutor,
  type ChatUserContext,
  type AgentToolSpec,
  type ToolExecuteResult,
} from "./tools";
export { setLlmProvider, getLlmProvider, type LlmProvider } from "./llm";
