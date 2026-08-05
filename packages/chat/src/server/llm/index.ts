import { AppError } from "@monark/common";
import { createAnthropicProvider } from "./anthropic";
import type { LlmProvider } from "./types";

// Provider selection. v1 ships Anthropic; the LlmProvider interface keeps the
// agent loop vendor-agnostic so a second provider is a drop-in (add a case
// below + a factory). Resolution is lazy + cached: the provider is only built
// on first use, so an unconfigured deploy fails only when someone actually
// opens the AI chat, not at boot.

let override: LlmProvider | null = null;
let cached: LlmProvider | null = null;

export function getLlmProvider(): LlmProvider {
  if (override) return override;
  if (cached) return cached;
  const providerId = process.env.CHAT_LLM_PROVIDER?.trim() || "anthropic";
  switch (providerId) {
    case "anthropic":
      cached = createAnthropicProvider();
      return cached;
    default:
      throw new AppError(
        "chat_llm_not_configured",
        `Unknown CHAT_LLM_PROVIDER "${providerId}". Supported: anthropic.`,
        503,
      );
  }
}

/** Inject a provider (tests / a custom host). Pass null to clear. */
export function setLlmProvider(provider: LlmProvider | null): void {
  override = provider;
  cached = null;
}

export type {
  LlmProvider,
  LlmMessage,
  LlmContent,
  LlmToolSpec,
  LlmStreamEvent,
  LlmStreamParams,
  LlmStopReason,
} from "./types";
