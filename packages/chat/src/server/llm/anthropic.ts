import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@monark/common";
import type {
  LlmContent,
  LlmMessage,
  LlmProvider,
  LlmStopReason,
  LlmStreamEvent,
  LlmStreamParams,
} from "./types";

// Anthropic implementation of the provider-agnostic LlmProvider. It is the only
// file that imports the vendor SDK; everything above speaks the LlmMessage /
// LlmStreamEvent types. Config is read lazily (fail-closed) so a deploy that
// never opens chat — and CI / typecheck — doesn't need ANTHROPIC_API_KEY set.

const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const DEFAULT_MAX_TOKENS = 4096;

// Minimal structural view of the streaming events we consume, so we don't pin
// to SDK-internal type names across versions. The SDK's stream also yields other
// event types (message_start, ping, ...) which fall through the switch default.
type RawStreamEvent =
  | {
      type: "content_block_start";
      index: number;
      content_block: { type: string; id?: string; name?: string };
    }
  | {
      type: "content_block_delta";
      index: number;
      delta: { type: string; text?: string; partial_json?: string };
    }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason?: string | null } }
  | { type: "message_stop" };

type StreamParam = Parameters<Anthropic["messages"]["stream"]>[0];

function mapStopReason(reason: string | null | undefined): LlmStopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    default:
      return "other";
  }
}

// A mutable JSON block (so we can attach cache_control after building).
type Block = Record<string, unknown>;

// Translate our provider-agnostic content blocks into the SDK's block shapes.
function toAnthropicContent(content: LlmContent[]): Block[] {
  return content.map((block): Block => {
    switch (block.kind) {
      case "text":
        return { type: "text", text: block.text };
      case "tool_use":
        return { type: "tool_use", id: block.id, name: block.name, input: block.input };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: block.toolUseId,
          content: block.content,
          is_error: block.isError,
        };
    }
  });
}

function toAnthropicMessages(
  messages: LlmMessage[],
): Array<{ role: LlmMessage["role"]; content: Block[] }> {
  return messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }));
}

const CACHE: { type: "ephemeral" } = { type: "ephemeral" };

class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  readonly model: string;
  #client: Anthropic;
  #maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.#client = new Anthropic({ apiKey });
    this.model = model;
    this.#maxTokens = maxTokens;
  }

  async *streamChat(params: LlmStreamParams): AsyncIterable<LlmStreamEvent> {
    // ── Prompt caching ──────────────────────────────────────────────────────
    // Three ephemeral cache breakpoints (≤ 4 allowed): the static system prompt,
    // the (static) tool set, and the growing conversation prefix. The system +
    // tools are byte-identical every turn (page context rides the user message,
    // not the system), so they cache-read at ~10% of input cost after the first
    // turn; the last-message breakpoint extends the cached prefix each turn.
    const messages = toAnthropicMessages(params.messages);
    const lastMsg = messages[messages.length - 1];
    const lastBlock = lastMsg?.content[lastMsg.content.length - 1];
    if (lastBlock) lastBlock.cache_control = CACHE;

    const tools = params.tools.map(
      (t, i): Block => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
        ...(i === params.tools.length - 1 ? { cache_control: CACHE } : {}),
      }),
    );

    const body = {
      model: this.model,
      max_tokens: params.maxTokens ?? this.#maxTokens,
      // Array form so the static system prompt carries a cache breakpoint.
      system: [{ type: "text", text: params.system, cache_control: CACHE }],
      messages,
      tools,
    } as unknown as StreamParam;

    const stream = this.#client.messages.stream(body, { signal: params.signal });

    // Per-content-block accumulation for streamed tool_use inputs (the model
    // emits the JSON arguments as `input_json_delta` fragments).
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
    let stopReason: LlmStopReason = "other";

    for await (const raw of stream as unknown as AsyncIterable<RawStreamEvent>) {
      switch (raw.type) {
        case "content_block_start": {
          const block = raw.content_block;
          if (block?.type === "tool_use") {
            toolBlocks.set(raw.index, { id: block.id ?? "", name: block.name ?? "", json: "" });
          }
          break;
        }
        case "content_block_delta": {
          if (raw.delta.type === "text_delta" && raw.delta.text) {
            yield { kind: "text-delta", text: raw.delta.text };
          } else if (raw.delta.type === "input_json_delta") {
            const acc = toolBlocks.get(raw.index);
            if (acc) acc.json += raw.delta.partial_json ?? "";
          }
          break;
        }
        case "content_block_stop": {
          const acc = toolBlocks.get(raw.index);
          if (acc) {
            let input: unknown = {};
            try {
              input = acc.json.trim() ? JSON.parse(acc.json) : {};
            } catch {
              // Malformed partial JSON: surface an empty object; the tool's zod
              // schema will reject it and the loop reports the error to the model.
              input = {};
            }
            yield { kind: "tool-call", id: acc.id, name: acc.name, input };
            toolBlocks.delete(raw.index);
          }
          break;
        }
        case "message_delta": {
          stopReason = mapStopReason(raw.delta.stop_reason);
          break;
        }
        case "message_stop": {
          yield { kind: "done", stopReason };
          break;
        }
        default:
          break;
      }
    }
  }
}

/** Build the Anthropic provider from env. Throws (fail-closed) if unconfigured. */
export function createAnthropicProvider(): LlmProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "chat_llm_not_configured",
      "The AI chat agent is not configured: ANTHROPIC_API_KEY is unset.",
      503,
    );
  }
  const model = process.env.CHAT_LLM_MODEL?.trim() || DEFAULT_MODEL;
  const maxTokens = Number(process.env.CHAT_LLM_MAX_TOKENS) || DEFAULT_MAX_TOKENS;
  return new AnthropicProvider(apiKey, model, maxTokens);
}
