# @monark/chat

A generic **conversation substrate** whose first use is an **app-owned AI agent**.
Conversations are multi-participant (a human, or the AI agent, is a participant),
so the same tables carry today's user↔AI assistant threads and tomorrow's
user↔user chat with no migration. The agent answers questions and takes actions
over the org's data by calling the app's own tRPC procedures **in-process, as the
signed-in user**, so every tool inherits that user's RBAC.

`core` module. It owns its `Conversation` / `ConversationParticipant` / `Message`
/ `MessageToolCall` models in the shared `schema.prisma` under the
`// ── MODULE: chat ──` banner and its migration.

## What's here

- **`contracts/`** — the `ChatEvents` union (`chat.conversation-created` /
  `chat.message-created`; events carry ids + org + actor, **never message
  content**) and shared enum/view types (`ConversationKind`, `MessageView`,
  `ChatMessageContext`, …).
- **`server/`** — the tRPC router (`index.ts`, exported as `chatRouter`), the
  Prisma data layer (`data.ts`), the agent loop (`agent.ts`), the LLM provider
  abstraction (`llm/`), the tool-executor injection seam (`tools.ts`), and
  permission / event-type / feature-flag registration.
- **`client/`** — empty. The web companion lives in
  `services/web/src/components/chat/` (a docked panel mounted from
  `(authed)/layout.tsx`).

## Key concepts

- **In-process tools, one registry.** The agent's tools are built from the SAME
  `V1_ROUTES` public-API descriptors that drive the external MCP server (see
  `services/api/src/chat/tools.ts` → `buildChatToolset`). MCP adapts them for
  third-party agents over stdio; the in-app agent runs them in-process through the
  tRPC caller (`createCaller(appRouter)`) as the logged-in user — no HTTP hop, no
  API key, no second authorization path. Each tool is gated by its own
  procedure's permission (e.g. `data-models.record-write`); chat adds no bypass.
- **In-app-only tools.** Surfaces kept off the public API but given to the agent
  (e.g. **automations**) are defined as `InAppTool`s in
  `services/api/src/chat/automation-tools.ts` and merged into the same toolset;
  they call `caller.automation.*` directly (per-procedure RBAC + confirm-gate
  still apply). Graph writes pre-validate with the exported `validateGraph`.
- **Layering via injection.** The package can't import `appRouter` (that lives in
  `services/api`), so the concrete executor is injected at boot with
  `setChatToolExecutor(...)` — the same pattern as `setWebhookSecretResolver`.
- **Confirm-each-write.** A read-only tool runs straight through; a **mutating**
  tool pauses at `PROPOSED` until the user confirms (→ executes) or rejects
  (→ `REJECTED`). The loop (`advanceConversation`) is re-entrant and stateless
  between turns — it reloads the conversation each time — so `confirmToolCall` /
  `rejectToolCall` simply advance again.
- **Provider-abstracted.** `LlmProvider` (streaming + tool-calling) keeps the loop
  vendor-agnostic; `AnthropicProvider` is the first impl. Resolution is lazy +
  overridable (`setLlmProvider`) for tests / alt hosts.
- **Per-org, per-participant scoping.** Every row is `organizationId`-scoped; a
  conversation is only reachable by a participant. Message content + tool
  inputs/outputs are stored verbatim for replay + audit.

## Public API

| Export                                             | From                     | Purpose                                                                             |
| -------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `chatRouter`                                        | `@monark/chat/server`    | tRPC router (see tRPC surface).                                                     |
| `advanceConversation(ctx, id, opts?)`               | `@monark/chat/server`    | Run the agent turn(s) until done or a mutation needs confirmation.                  |
| `confirmToolCall` / `rejectToolCall(ctx, id)`       | `@monark/chat/server`    | Resolve a gated tool call, then resume the loop.                                    |
| `setChatToolExecutor(exec)` / `getChatToolExecutor` | `@monark/chat/server`    | Inject / read the concrete tool executor (wired in `services/api`).                |
| `setLlmProvider(p)` / `getLlmProvider()`            | `@monark/chat/server`    | Override / resolve the LLM provider.                                                |
| `register{Permissions,EventTypes,FeatureFlags}()`   | `@monark/chat/server`    | Boot-time registration.                                                             |
| `ChatEvents`, `MessageView`, `ChatMessageContext`   | `@monark/chat/contracts` | Domain events + shared types.                                                       |

## Data model

Owned here (`// ── MODULE: chat ──` in `packages/db/prisma/schema.prisma`,
migration `20260804150000_add_chat`):

- **`Conversation`** — `id`, `organizationId` (FK → `Organization`, Cascade),
  `kind` (`AI_ASSISTANT` | `DIRECT` | `GROUP`), `title?`, `createdById` (FK →
  `User`), `lastMessageAt?`, timestamps, `deletedAt?`.
- **`ConversationParticipant`** — `conversationId`, `participantType`
  (`USER` | `AI_AGENT`), `userId?` (null for the AI). Unique `(conversationId,
  userId)`.
- **`Message`** — `conversationId`, `organizationId` (denormalized), `authorType`
  (`USER` | `AI_AGENT` | `TOOL`), `authorUserId?` (SetNull), `content`, `createdAt`.
- **`MessageToolCall`** — `messageId`, `organizationId`, `toolCallRef`, `toolName`,
  `input` (JSON), `status` (`PROPOSED`→`EXECUTING`→`SUCCEEDED`/`FAILED`/`REJECTED`),
  `mutates`, `result?`, `errorMessage?`. Persisted for audit + replay.

## Events emitted

- `chat.conversation-created` — `organizationId`, `conversationId`, `kind`,
  `actorId`.
- `chat.message-created` — `organizationId`, `conversationId`, `messageId`,
  `authorType`, `actorId` (null for AI/TOOL). **Never carries content.**

Consumes none.

## tRPC surface

All gated by `chat.use` + the `chat.enabled` flag; agent turns additionally
require `chat.ai-agent`.

- `chat.conversations.list` / `.get` / `.create` / `.rename` / `.delete`
- `chat.messages.list` / `.send` (`send` accepts an optional page `context`;
  creates a conversation when none is given, runs the agent turn, returns
  `{ conversationId, status }`)
- `chat.toolCalls.confirm` / `.reject`

## Feature flags

- `chat.enabled` — the module + web surface. Default **off**.
- `chat.ai-agent` — the LLM-backed agent (requires `chat.enabled`). Default **off**.

## Environment

- `ANTHROPIC_API_KEY` — required for the Anthropic provider (loaded lazily;
  unset only fails when someone actually opens the AI agent).
- `CHAT_LLM_PROVIDER` (default `anthropic`), `CHAT_LLM_MODEL`,
  `CHAT_LLM_MAX_TOKENS` — optional overrides.
- `CHAT_ASSISTANT_NAME` — the assistant's display name (default `Chrysa`). Used in
  the system prompt and surfaced to the web UI via the `chat.config` query, so
  one setting brands the assistant everywhere. A per-org override can layer on
  this later.
