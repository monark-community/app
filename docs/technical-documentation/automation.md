# Automation module

`@monark/automation` (Core tier) — event-triggered automation flows built on a visual node-graph editor, with durable execution and a node-type registry other modules extend.

See the package [README](../../packages/automation/README.md) for the public API surface. This document covers the internals and the extension contract.

## Shape of a flow

An **Automation** is a node graph stored as a single JSON blob (`Automation.graph` = `{ nodes, edges }`, exactly what the React Flow editor holds — see [contracts/graph.ts](../../packages/automation/src/contracts/graph.ts)). A flow has one **trigger** node (bound to a domain event type) wired to **action** nodes. The graph is validated against `automationGraphSchema` on save and re-parsed by the engine before each run.

## Execution: durable outbox + worker

Execution never happens on the request path. The pieces:

1. **Subscriber** ([subscriber.ts](../../packages/automation/src/server/subscriber.ts)) — an `on(WILDCARD_EVENT_TYPE, …)` handler. On every emit it resolves the event's org(s) (direct `organizationId`, else the actor's memberships via `getUserOrgs`), finds enabled automations whose `triggerEventType` matches, and inserts one `PENDING` **AutomationRun** each. That's all — cheap work, so it never blocks the request that emitted the event. It skips `automation.*` events to avoid feedback loops, and is registered **before** the webhook subscriber in [server.ts](../../services/api/src/server.ts).
2. **Worker** ([worker.ts](../../packages/automation/src/server/worker.ts)) — a `setInterval` poller (`startAutomationWorker`, wired into `startBackgroundWork`). It lists due `PENDING` runs and claims each atomically: `updateMany({ where: { id, status: "PENDING" }, data: { status: "RUNNING", attempts: {increment:1} } })`. The `status` guard means exactly one worker wins a claim, so it's safe across processes. On failure it retries with exponential backoff via `nextAttemptAt` up to `AUTOMATION_MAX_ATTEMPTS` (3), then dead-letters to `FAILED`. It emits `automation.run-started` / `-succeeded` / `-failed`.
3. **Engine** ([engine.ts](../../packages/automation/src/server/engine.ts)) — topologically orders the sub-graph reachable from the trigger (Kahn's algorithm; throws on a cycle), then runs each node, recording an `AutomationRunStep`. Before a node runs, its string config values are interpolated against a scope of `{ trigger: <event>, <upstreamNodeId>: <output> }` using `{{ path }}` tokens (whole-string tokens preserve the raw value's type; embedded tokens stringify).

   **Value-source nodes.** A node with no control inputs (`inputs: []`, e.g. Constant / Transform) is a pure value source — it needs no flow-in wire. `executionOrder` pulls it into the run automatically: any node feeding a `field:` port of a reachable node is added to the execution set and ordered before its consumer, even with no control edge into it. So wiring a Constant's output into a downstream field is enough to make it run.

   **Branching (active-handle gating).** A node executes only if it's the trigger or at least one incoming edge comes from an already-executed node's _active_ output handle. A node activates all its output handles by default (so linear action nodes are unchanged), or calls `ctx.activateOutputs(["true"])` to fire a subset. The Condition node does exactly this — a node reachable only through the un-taken handle is marked `SKIPPED` and its own outputs never activate, so the whole un-taken branch prunes. Edges carry `sourceHandle` (from React Flow) to distinguish a multi-output node's branches.

   **Durable delay (suspend/resume).** A node can call `ctx.suspend(ms)` (the Delay node does) — its step is still recorded `SUCCEEDED`, but the engine stops and the worker re-schedules the run via `markRunForResume` (PENDING, `nextAttemptAt = now + ms`, without counting a retry). `executeGraph` is **resumable**: on the next pass it loads the run's existing steps, rebuilds `upstream` / `executed` / active-handles from them, skips the already-done nodes, and continues downstream — so the pause survives a process restart and doesn't block the worker. Each step persists the exact output handles the node activated (`AutomationRunStep.activeHandles`), so a **branch taken before a Delay** resumes down only the chosen path — the pruned branch stays skipped. `attempts` counts failures only (bumped on retry, not on claim or resume), so a delayed run doesn't burn its retry budget.

This mirrors `@monark/webhooks`' outbox + delivery worker; the `AutomationRun` table **is** the outbox.

Run history: `AutomationRun` + `AutomationRunStep` rows persist every execution and per-node input/output/error, surfaced by `runs.list` / `runs.getById`.

## Extension API — the node-type registry

The load-bearing extension point ([registry.ts](../../packages/automation/src/server/registry.ts)):

```ts
import { registerAutomationNodes, defineNode } from "@monark/automation/server";
import { z } from "zod";

registerAutomationNodes("kanban", {
  "create-card": defineNode({
    descriptor: {
      kind: "action",
      category: "kanban",
      label: "Create Card",
      inputs: [{ id: "in" }],
      outputs: [{ id: "out" }],
      configFields: [{ key: "boardId", label: "Board", type: "text", required: true }],
    },
    configSchema: z.object({ boardId: z.string(), title: z.string() }),
    execute: async (ctx, config) => {
      /* server-side; ctx has organizationId, actorUserId, triggerEvent, upstream */
    },
  }),
});
```

- Called once at api boot, like `registerPermissions` / `registerEventTypes`. Idempotent (re-registering a type overwrites it).
- `defineNode` erases the config generic into a uniform `run(ctx, rawConfig)` that parses config against `configSchema` before calling `execute` — so the registry is heterogeneous without `any`, and a bad config fails just that node's step.
- The full definition (descriptor + schema + `execute`) lives server-side. `trpc.automation.nodeTypes.list` projects only the serializable `AutomationNodeDescriptor` (kind / category / label / ports / `configFields`) to the editor palette — `execute` never crosses to the client.
- Core ships its built-ins through the same API ([nodes/](../../packages/automation/src/server/nodes)): the Event Trigger; control-flow nodes (`condition` true/false branch, `constant`, `transform` — a formula via the shared `tryEvaluateFormula` engine, `delay`); communication nodes (`notification`, `send-email`, `webhook`); Data nodes (`data-create-record` / `-update-` / `-delete-` / `-find-record`, plus `data-find-records` which queries by a field filter); RBAC nodes (`rbac-assign-role`, `rbac-remove-role`); and user nodes (`user-get`, `user-set-metadata`, `user-update-profile`, `user-set-active` deactivate/reactivate). A `user`-typed config field renders as an org-member picker (via `automation.members.list`), and a `data-model` field as a model picker.

`NodeExecutionContext` gives a node the org, the **owner identity** the run acts as (`Automation.createdBy`), the triggering event, and the outputs of upstream nodes. **Privileged nodes re-check the owner's capability at execution time** via `requireOwnerPermission(ctx, "<permission>")` ([nodes/shared.ts](../../packages/automation/src/server/nodes/shared.ts)) — the data nodes require `data-models.record-{write,read,delete}`, the RBAC nodes require `rbac.assign-role`, and the metadata node requires `users.write-metadata-for-module-<module>`. A run whose owner is gone (null) is denied outright. This keeps an automation from escalating beyond what its author could do by hand.

**Secrets** — `ctx.getSecret(name)` resolves one of the running automation's org's encrypted secrets ([`@monark/secrets`](secrets.md)), or `null`. Author-side, a `secret`-typed config field renders as a name picker (via `automation.secrets.list`, gated on `automation.view`) and stores the secret's **name** — so the plaintext never reaches the editor or the persisted run config. The value is decrypted server-side only for the node's own outbound call; it must never be `ctx.log`-ed or returned as node output. Outbound HTTP from a node goes through `safeFetch` ([`@monark/common/http`](../../packages/common/src/http.ts)), which applies the same scheme/host guard as the webhook node and an abort timeout.

## RBAC

Permissions `automation.{view,create,manage,run}` gate the tRPC router ([router.ts](../../packages/automation/src/server/router.ts)); every mutation resolves the org (`requireOrg`) then `requirePermission`. The whole module (nav, editor, engine, worker) sits behind the `automation.enabled` feature flag (default off) for incremental rollout.

## Events

Emits `automation.created` / `updated` / `deleted` and `automation.run-started` / `-succeeded` / `-failed` (registered in the event-type registry, so operators can subscribe webhooks to them). Consumes **every** domain event via the wildcard subscriber for trigger matching.

## Web

A flag-gated `/automation` section: a `DataTable` list and a full-page React Flow editor (`@xyflow/react`) with a node palette, a per-node config panel driven by each node's `configFields`, save, run-now, and a run-history sheet. The trigger-node event picker and the editor palette are fed by `eventTypes.list` / `nodeTypes.list`.

**Trigger outputs.** `eventTypes.list` returns each event's `fields` — its declared payload fields (from the event-type registry) merged with the common base fields via `eventFieldsFor(type)`. The Event Trigger inspector renders these as an **Outputs** section so a flow author sees what information the event carries (e.g. `totp.disabled` → `userId`, `triggeredBy`, `occurredAt`) and can copy the matching `{{ trigger.<key> }}` token. To surface a new event's fields to authors, declare them in that module's `server/event-types.ts` (see the event-type registry section of the [extensibility contract](extensibility-contract.md)); no automation-side change is needed.
