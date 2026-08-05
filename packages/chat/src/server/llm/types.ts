// Provider-agnostic conversation + tool types the agent loop speaks. Concrete
// providers (Anthropic first) translate these to/from their own wire formats,
// so the loop — and everything above it — never imports a vendor SDK type.

export type LlmRole = "user" | "assistant";

export type LlmTextContent = { kind: "text"; text: string };

export type LlmToolUseContent = {
  kind: "tool_use";
  /** Provider-issued tool-call id, echoed back with the matching result. */
  id: string;
  name: string;
  input: unknown;
};

export type LlmToolResultContent = {
  kind: "tool_result";
  toolUseId: string;
  /** JSON-encoded tool result, or an error message when `isError`. */
  content: string;
  isError: boolean;
};

export type LlmContent = LlmTextContent | LlmToolUseContent | LlmToolResultContent;

export type LlmMessage = { role: LlmRole; content: LlmContent[] };

/** A tool advertised to the model. `inputSchema` is JSON Schema. */
export type LlmToolSpec = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

/** Why the model stopped this turn. `tool_use` means it wants tools run. */
export type LlmStopReason = "end" | "tool_use" | "max_tokens" | "other";

/** Streaming deltas a provider yields as it generates a turn. */
export type LlmStreamEvent =
  | { kind: "text-delta"; text: string }
  | { kind: "tool-call"; id: string; name: string; input: unknown }
  | { kind: "done"; stopReason: LlmStopReason };

export type LlmStreamParams = {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolSpec[];
  maxTokens?: number;
  signal?: AbortSignal;
};

export interface LlmProvider {
  /** Stable id, e.g. "anthropic". */
  readonly id: string;
  /** The model this provider is configured to call. */
  readonly model: string;
  streamChat(params: LlmStreamParams): AsyncIterable<LlmStreamEvent>;
}
