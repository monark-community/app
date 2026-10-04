---
type: concept
---

# How the AI assistant works

The assistant is an AI agent built into Monark. It answers questions about the organization's data and makes changes on request by calling the same server procedures the web app calls, as the signed-in user. So it can only see and change what that user can, and no change happens until the user confirms it.

## It acts as the user

Each tool runs through a server-side caller built from the user's own session, so it passes the procedure's own permission check, record access rules and validation, and emits the same events as a click in the UI. Chat adds no bypass and no extra ceiling. Running tools in-process, rather than through Monark's own MCP server, is what keeps the real user as the actor: [Run assistant tools in-process instead of through our MCP server](../decisions/0010-run-assistant-tools-in-process.md).

Three gates sit in front of the assistant: permission to use chat, the chat module being on, and the AI agent being on. The last is the kill switch for the AI part, per user, per organization or everywhere.

## Conversations

The assistant runs on a general conversation module, `@monark/chat` (core). The AI agent is one kind of participant, so the same tables can carry person-to-person chat later. Every message and tool call (input, status, result) is stored per organization for replay and audit. Chat's domain events carry ids, never message content.

## A turn, step by step

```
user sends a message
        |
        v
reload the conversation, rebuild the model's message list, add page context
        |
        v
model streams a reply  ------>  tokens go to the browser over SSE
        |
        +-- no tool calls ......... turn ends
        +-- read-only tool ........ run now, store the result, go round again
        +-- write tool ............ store as proposed, stop ("awaiting confirmation")
                                            |
                                user clicks Confirm or Reject
                                            |
                                            v
                                   the same loop runs again
```

The loop keeps no state between steps. Each step reloads the conversation from the database and replays it to the model, so resuming after a confirmation needs nothing in memory: it works after a restart, on another api instance, or days later. The loop also refuses to call the model while any tool call is still proposed or running, so the model never sees a tool call without its result.

It fails safe. A tool name the model invents is treated as a write. A failed or rejected tool goes back to the model as an error result instead of ending the turn. One turn stops after eight model steps.

## Every write waits for the user

Read-only tools run straight away and show as a status card in the thread. A tool that changes data stops at a card ("Wants to create a record") with **Confirm** and **Reject**. Either way the assistant then carries on, with the result or with the refusal.

Navigation is the one tool with no server effect. The server can't move the user's browser, so the `navigate` tool only checks that the target is an in-app path and returns it. The thread shows a **Go to {label}** button, and the user's click is the confirmation.

## Where the tools come from

Two sources are merged into one tool set at boot:

- Public API routes: Every route that opted in to MCP exposure becomes a tool, so one definition serves outside agents and the assistant. A route that isn't a `GET` is a write.
- In-app-only tools: Surfaces kept off the public API on purpose: automations, wiki pages and navigation. Automation writes send the whole flow and are checked against the live node registry first, so the model gets a list of problems to fix.

The `@monark/chat` package can't import the api's router, so the api builds the tool executor and hands it to the package at boot: [Inject the assistant's tool executor at boot](../decisions/0011-inject-the-assistant-tool-executor-at-boot.md). Every tool, with whether it writes and the permission it needs: [Assistant tools](../reference/chat-agent-tools.md).

## Page context

With each message the panel sends where the user is: the route, and the model and record in focus, if any. The loop turns that into a sentence ("The user is currently looking at the "tasks" model…") so the model can resolve "this record". It goes into the current user message, never the system prompt, to keep the prompt cache stable (below).

## Streaming

Replies stream token by token over a dedicated Server-Sent Events endpoint, `POST /chat/stream`, because the app's shared tRPC client batches requests and can't stream. It uses the same session and send path as the ordinary send mutation. Confirm and reject are ordinary requests, so the reply after a confirmation appears when the thread refetches.

## The model provider

The loop talks to a small provider interface: streamed text plus tool calls. Anthropic is the only implementation and the only code that imports a vendor SDK. It's built on first use, so a deploy without an API key starts normally and fails only when someone talks to the assistant.

Each step resends the system prompt and every tool schema, so the Anthropic provider marks three cache breakpoints: the system prompt, the tool set, and the conversation so far. Keeping the page context out of the system prompt is what keeps that prefix identical between turns.

## The assistant's name

The assistant is called Chrysa unless the deployment sets another name. When per-organization branding is on, an admin can override it with **AI assistant name** in the organization settings. One resolved name feeds both the system prompt and the UI.

## Limits

- The reply after a confirmation doesn't stream.
- The chat panel has a fixed width.
- The schema supports person-to-person conversations; the app has no UI for them.
- The assistant can read a wiki page's body but not edit it; it manages titles, icons and the page tree.
- The permission to moderate other people's conversations is registered, but nothing uses it.

## Related

- [Assistant tools](../reference/chat-agent-tools.md)
- [Give the assistant a new tool](../build/extend/add-an-assistant-tool.md)
- [Use the assistant](../use/assistant/_index.md)
- [`@monark/chat` README](../../packages/chat/README.md): exports, data model, events, flags and environment variables
