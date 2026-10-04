---
type: decision
status: accepted
date: 2026-08-05
---

# 0011. Inject the assistant's tool executor at boot

## Context

The assistant's loop lives in the `@monark/chat` package. To run a tool it needs the app's tRPC router and the public route descriptors, and both live in `services/api`. Packages never import the api service: dependencies point from `services/api` to packages, never back, and importing the router from a package would create a cycle. So the package that owns the loop can't build its own tools.

## Options

| Option                                                        | For                                                            | Against                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Import the router from the chat package                       | Everything in one place                                        | A dependency cycle; breaks the layering rule every other package follows                 |
| Move the loop into `services/api`                             | No seam needed                                                 | The conversation module stops being reusable; the loop can't be tested without the api   |
| Define a contract in the package, inject the executor at boot | Dependencies stay one-way; the package is testable with a fake | Tools are assembled away from the loop; a host that forgets to wire it fails at run time |

## Decision

`@monark/chat` defines the contract, `ChatToolExecutor`: list the tool specs, look one up by name, and run a call as a given user (never throwing; a failure is a result). The api implements it in `buildChatToolset()` and wires it before serving any request:

```ts
// services/api/src/server.ts
setChatToolExecutor(buildChatToolset());
```

If nothing is wired, the first chat turn fails with `chat_tools_not_wired` (503) instead of running an agent with no tools. This is the same host-injection seam as `setWebhookSecretResolver`.

## Consequences

- The dependency graph stays one-way, and `@monark/chat` stays usable by another host.
- The package's tests drive the loop with a fake executor, without the api.
- New tools go in `services/api/src/chat/`, not in the package that owns the loop.
- The executor is set once for the whole process. Every user sees the same tool list; what each person can actually do is decided by their permissions at call time.
