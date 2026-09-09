# The loop + the confirm-each-write gate

`advanceConversation(ctx, conversationId, opts?)` is **re-entrant and stateless
between turns**: each call reloads the conversation from the DB and replays it to
the model. Per step it streams the assistant turn, persists it, then for each
requested tool call:

- **read-only** → run immediately, record `SUCCEEDED`/`FAILED`, loop so the model
  can use the result;
- **mutating** → record `PROPOSED` and stop, returning `awaiting_confirmation`.

The UI then calls `chat.toolCalls.confirm` / `.reject`, which resolve the call and
simply call `advanceConversation` again. Because the loop reloads state, resume is
free : there's no in-memory turn state to reconstruct. Every message and tool call
(input, status, result) is persisted for replay + audit.

`buildLlmMessages` maps stored rows to the provider-agnostic message list; an
assistant message with tool calls is followed by a synthetic user message
carrying the matching `tool_result` blocks. The loop never calls the model while
any tool call is still `PROPOSED`/`EXECUTING` (the pending gate), so it can never
send a turn missing a tool result.
