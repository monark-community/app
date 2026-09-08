# Provider abstraction

`LlmProvider` (`llm/types.ts`) is a minimal streaming + tool-calling interface;
`AnthropicProvider` (`llm/anthropic.ts`) is the only file that imports a vendor
SDK. Resolution is lazy + cached (`getLlmProvider`) and overridable
(`setLlmProvider`) for tests / alternate hosts. Config: `ANTHROPIC_API_KEY`,
`CHAT_LLM_PROVIDER`, `CHAT_LLM_MODEL`, `CHAT_LLM_MAX_TOKENS`.

**Prompt caching.** The agent is input-heavy (the system prompt + all tool
schemas are resent every turn), so the Anthropic provider sets three ephemeral
`cache_control` breakpoints: the static system prompt, the tool set, and the
growing conversation prefix. For the cached prefix to stay byte-identical across
turns, the per-turn page context is injected into the **current user message**
(`injectContext`), never the system prompt. Cache reads bill at ~10% of input
after the first turn (default 5-min TTL); a prefix below the model's minimum
cacheable size just isn't cached (no error).
