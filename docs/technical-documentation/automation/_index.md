# Automation module

`@monark/automation` (Core tier) : event-triggered automation flows built on a visual node-graph editor, with durable execution and a node-type registry other modules extend.

See the package [README](../../../packages/automation/README.md) for the public API surface. This document covers the internals and the extension contract.

## In this section

- **[Execution: durable outbox + worker](execution-durable-outbox-worker.md)**
- **[Extension API : the node-type registry](extension-api-the-node-type-registry.md)**

## Shape of a flow

An **Automation** is a node graph stored as a single JSON blob (`Automation.graph` = `{ nodes, edges }`, exactly what the React Flow editor holds ; see [contracts/graph.ts](../../../packages/automation/src/contracts/graph.ts)). A flow has one **trigger** node (bound to a domain event type) wired to **action** nodes. The graph is validated against `automationGraphSchema` on save and re-parsed by the engine before each run.


## RBAC

Permissions `automation.{view,create,manage,run}` gate the tRPC router ([router.ts](../../../packages/automation/src/server/router.ts)); every mutation resolves the org (`requireOrg`) then `requirePermission`. The whole module (nav, editor, engine, worker) sits behind the `automation.enabled` feature flag (default off) for incremental rollout.


## Events

Emits `automation.created` / `updated` / `deleted` and `automation.run-started` / `-succeeded` / `-failed` (registered in the event-type registry, so operators can subscribe webhooks to them). Consumes **every** domain event via the wildcard subscriber for trigger matching.


## Web

A flag-gated `/automation` section: a `DataTable` list and a full-page React Flow editor (`@xyflow/react`) with a node palette, a per-node config panel driven by each node's `configFields`, save, run-now, and a run-history sheet. The trigger-node event picker and the editor palette are fed by `eventTypes.list` / `nodeTypes.list`.

**Trigger outputs.** `eventTypes.list` returns each event's `fields` ; its declared payload fields (from the event-type registry) merged with the common base fields via `eventFieldsFor(type)`. The Event Trigger inspector renders these as an **Outputs** section so a flow author sees what information the event carries (e.g. `totp.disabled` → `userId`, `triggeredBy`, `occurredAt`) and can copy the matching `{{ trigger.<key> }}` token. To surface a new event's fields to authors, declare them in that module's `server/event-types.ts` (see the event-type registry section of the [extensibility contract](../extensibility-contract/_index.md)); no automation-side change is needed.
