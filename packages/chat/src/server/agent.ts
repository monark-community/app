import { logger } from "@monark/common";
import {
  appendMessage,
  getToolCall,
  loadAgentHistory,
  recordToolCall,
  updateToolCallStatus,
} from "./data";
import { getAssistantName } from "./config";
import { getLlmProvider } from "./llm";
import type { LlmContent, LlmMessage } from "./llm";
import { getChatToolExecutor, type ChatUserContext } from "./tools";
import type { ChatMessageContext, MessageView } from "../contracts";

// The agent loop. It is deliberately re-entrant and stateless between turns:
// each call reloads the conversation from the DB, so `confirm`/`reject` of a
// gated tool call resumes the exact same loop by simply calling advance again.
//
// Flow per step: replay history to the model -> stream the assistant turn ->
// persist it -> for each requested tool call, run it now if read-only, or PAUSE
// at PROPOSED if it mutates (the confirm-each-write gate). When a mutation is
// pending we stop and return `awaiting_confirmation`; the UI confirms, we
// execute, then advance again.

const MAX_STEPS = 8;

function systemPrompt(assistantName: string): string {
  return [
    `You are ${assistantName}, Monark's built-in assistant, helping a signed-in member work with their organization's data.`,
    "You have tools that read and write the organization's Data Models and records. Every tool runs as the current user, so you can only ever see or change what they are permitted to.",
    "Prefer discovering structure before acting: list models and fields before reading or writing records when you are unsure.",
    "Mutating actions (create / update / delete) are shown to the user for confirmation before they run, so state your intent clearly and let the confirmation happen; do not claim a change is done until the tool result confirms it.",
    "Be concise and concrete. When you cannot do something (no permission, missing data), say so plainly.",
  ].join(" ");
}

export type AdvanceStatus = "done" | "awaiting_confirmation" | "max_steps";

export type AdvanceResult = { status: AdvanceStatus };

/** Optional per-turn hooks (used by the streaming transport; no-ops otherwise). */
export interface AdvanceHooks {
  onTextDelta?: (text: string) => void;
}

export interface AdvanceOptions {
  /** "Where the user is" hint, folded into the system prompt for this run. */
  context?: ChatMessageContext;
  hooks?: AdvanceHooks;
}

// Fold the caller's page context into an extra system-prompt sentence. Empty
// when no context was supplied.
function contextPrompt(context?: ChatMessageContext): string {
  if (!context) return "";
  const parts: string[] = [];
  if (context.route) parts.push(`the page "${context.route}"`);
  if (context.focus?.model) {
    parts.push(
      context.focus.recordId
        ? `the "${context.focus.model}" model (record ${context.focus.recordId})`
        : `the "${context.focus.model}" model`,
    );
  }
  if (parts.length === 0) return "";
  return ` The user is currently looking at ${parts.join(", ")}; interpret references like "this" or "here" against that when it makes sense.`;
}

function hasUnresolvedToolCalls(history: MessageView[]): boolean {
  return history.some((m) =>
    m.toolCalls.some((tc) => tc.status === "PROPOSED" || tc.status === "EXECUTING"),
  );
}

// Replay stored messages into the provider-agnostic message list. An assistant
// message with tool calls is followed by a synthetic user message carrying the
// matching tool_result blocks (Anthropic's required shape).
function buildLlmMessages(history: MessageView[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  for (const msg of history) {
    if (msg.authorType === "USER") {
      out.push({ role: "user", content: [{ kind: "text", text: msg.content }] });
      continue;
    }
    if (msg.authorType !== "AI_AGENT") continue;

    const assistantContent: LlmContent[] = [];
    if (msg.content) assistantContent.push({ kind: "text", text: msg.content });
    for (const tc of msg.toolCalls) {
      assistantContent.push({ kind: "tool_use", id: tc.toolCallRef, name: tc.toolName, input: tc.input });
    }
    if (assistantContent.length > 0) out.push({ role: "assistant", content: assistantContent });

    const results: LlmContent[] = [];
    for (const tc of msg.toolCalls) {
      if (tc.status === "SUCCEEDED") {
        results.push({
          kind: "tool_result",
          toolUseId: tc.toolCallRef,
          content: JSON.stringify(tc.result ?? null),
          isError: false,
        });
      } else if (tc.status === "FAILED") {
        results.push({
          kind: "tool_result",
          toolUseId: tc.toolCallRef,
          content: tc.errorMessage ?? "The tool failed.",
          isError: true,
        });
      } else if (tc.status === "REJECTED") {
        results.push({
          kind: "tool_result",
          toolUseId: tc.toolCallRef,
          content: "The user declined to run this action.",
          isError: true,
        });
      }
      // PROPOSED / EXECUTING: no result yet — the pending gate stops us before
      // we ever try to send a turn that would be missing a tool_result.
    }
    if (results.length > 0) out.push({ role: "user", content: results });
  }
  return out;
}

/**
 * Advance a conversation until the model finishes or a mutating tool call needs
 * confirmation. Assumes the triggering user message has already been persisted.
 */
export async function advanceConversation(
  ctx: ChatUserContext,
  conversationId: string,
  options: AdvanceOptions = {},
): Promise<AdvanceResult> {
  const { context, hooks = {} } = options;
  const executor = getChatToolExecutor();
  const provider = getLlmProvider();
  const toolSpecs = executor.listSpecs();
  const system = systemPrompt(getAssistantName()) + contextPrompt(context);

  for (let step = 0; step < MAX_STEPS; step++) {
    const history = await loadAgentHistory(ctx.organizationId, conversationId);

    // A mutation is awaiting the user's confirmation — nothing to do until they
    // act. (On resume, confirm/reject will have moved it to a terminal status.)
    if (hasUnresolvedToolCalls(history)) return { status: "awaiting_confirmation" };

    const messages = buildLlmMessages(history);

    let text = "";
    const calls: Array<{ id: string; name: string; input: unknown }> = [];
    for await (const ev of provider.streamChat({
      system,
      messages,
      tools: toolSpecs.map((s) => ({
        name: s.name,
        description: s.description,
        inputSchema: s.inputSchema,
      })),
    })) {
      if (ev.kind === "text-delta") {
        text += ev.text;
        hooks.onTextDelta?.(ev.text);
      } else if (ev.kind === "tool-call") {
        calls.push({ id: ev.id, name: ev.name, input: ev.input });
      }
    }

    const assistant = await appendMessage({
      organizationId: ctx.organizationId,
      conversationId,
      authorType: "AI_AGENT",
      content: text,
    });

    if (calls.length === 0) return { status: "done" };

    let pendingMutation = false;
    for (const call of calls) {
      const spec = executor.getSpec(call.name);
      // Unknown tool → treat as mutating (fail safe: force confirmation).
      const mutates = spec ? spec.mutates : true;
      if (mutates) {
        await recordToolCall({
          organizationId: ctx.organizationId,
          messageId: assistant.id,
          toolCallRef: call.id,
          toolName: call.name,
          input: call.input,
          mutates: true,
          status: "PROPOSED",
        });
        pendingMutation = true;
      } else {
        const row = await recordToolCall({
          organizationId: ctx.organizationId,
          messageId: assistant.id,
          toolCallRef: call.id,
          toolName: call.name,
          input: call.input,
          mutates: false,
          status: "EXECUTING",
        });
        await executeAndRecord(ctx, row.id, call.name, call.input);
      }
    }

    if (pendingMutation) return { status: "awaiting_confirmation" };
    // All calls were read-only and have run; loop so the model can use them.
  }

  logger.warn({ conversationId }, "chat agent hit MAX_STEPS without finishing");
  return { status: "max_steps" };
}

// Run one tool call and persist its outcome. Never throws — a failure is fed
// back to the model as an error tool_result on the next turn.
async function executeAndRecord(
  ctx: ChatUserContext,
  toolCallId: string,
  toolName: string,
  input: unknown,
): Promise<void> {
  const executor = getChatToolExecutor();
  const res = await executor.execute({ ctx, toolName, input });
  if (res.ok) {
    await updateToolCallStatus({
      organizationId: ctx.organizationId,
      id: toolCallId,
      status: "SUCCEEDED",
      result: res.result,
    });
  } else {
    await updateToolCallStatus({
      organizationId: ctx.organizationId,
      id: toolCallId,
      status: "FAILED",
      errorMessage: res.error,
    });
  }
}

/** Confirm a PROPOSED (mutating) tool call, execute it, then resume the loop. */
export async function confirmToolCall(
  ctx: ChatUserContext,
  toolCallId: string,
  hooks: AdvanceHooks = {},
): Promise<AdvanceResult> {
  const tc = await getToolCall(ctx.organizationId, toolCallId);
  if (!tc) return { status: "done" };
  if (tc.status !== "PROPOSED") {
    // Already handled; just try to advance in case the model can continue.
    return advanceConversation(ctx, tc.conversationId, { hooks });
  }
  await updateToolCallStatus({ organizationId: ctx.organizationId, id: toolCallId, status: "EXECUTING" });
  await executeAndRecord(ctx, toolCallId, tc.toolName, tc.input);
  return advanceConversation(ctx, tc.conversationId, { hooks });
}

/** Reject a PROPOSED tool call; the model is told the user declined, then continues. */
export async function rejectToolCall(
  ctx: ChatUserContext,
  toolCallId: string,
  hooks: AdvanceHooks = {},
): Promise<AdvanceResult> {
  const tc = await getToolCall(ctx.organizationId, toolCallId);
  if (!tc) return { status: "done" };
  if (tc.status === "PROPOSED") {
    await updateToolCallStatus({
      organizationId: ctx.organizationId,
      id: toolCallId,
      status: "REJECTED",
      errorMessage: "Declined by the user.",
    });
  }
  return advanceConversation(ctx, tc.conversationId, { hooks });
}
