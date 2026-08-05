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
  | { type: "content_block_start"; index: number; content_block: { type: string; id?: string; name?: string } }
  | { type: "content_block_delta"; index: number; delta: { type: string; text?: string; partial_json?: string } }
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

// Translate our provider-agnostic content blocks into the SDK's block shapes.
function toAnthropicContent(content: LlmContent[]): unknown[] {
  return content.map((block) => {
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

function toAnthropicMessages(messages: LlmMessage[]): unknown[] {
  return messages.map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }));
}

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
    const body = {
      model: this.model,
      max_tokens: params.maxTokens ?? this.#maxTokens,
      system: params.system,
      messages: toAnthropicMessages(params.messages),
      tools: params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
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
