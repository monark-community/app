# Streaming (SSE)

The assistant's reply streams token-by-token over a dedicated **`POST /chat/stream`**
Server-Sent Events endpoint (`services/api/src/server.ts`), not tRPC : the
app-wide tRPC client is httpBatch-only, so chat streaming rides its own fetch to
keep the shared client untouched. The endpoint authenticates with the same
Supabase bearer (`createContext`) and calls the shared `sendMessage(ctx, input,
hooks)` (also backing the `chat.messages.send` mutation) with an `onTextDelta`
hook that writes `event: token` frames; it ends with `event: done`
(`{ conversationId, status }`) or `event: error`. The web thread
(`components/chat/stream.ts`) POSTs with the bearer and reads the body stream,
appending tokens to a live bubble, then refetches the persisted messages on
`done`. `confirmToolCall` / `rejectToolCall` remain non-streamed (tRPC mutations

- refetch), so the assistant's _post-confirmation_ reply appears on refetch
  rather than streaming : a reasonable v1 seam.
