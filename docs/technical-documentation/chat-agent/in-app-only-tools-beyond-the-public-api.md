# In-app-only tools (beyond the public API)

Some surfaces are deliberately kept OFF the public API / MCP but still given to
the in-app agent : automations are the first (an internal power-user surface we
don't want exposed to external agents). These live in
`services/api/src/chat/automation-tools.ts` as `InAppTool` defs (name,
description, a zod `inputSchema`, `mutates`, and a `run(caller, input)` closure);
`buildChatToolset` merges them alongside the route-derived tools. They call
`caller.automation.*` directly : same in-process caller, same per-procedure RBAC
(`automation.view` / `.create` / `.manage` / `.run`), same confirm-gate for
mutations. The tool set is discovery + whole-graph write: `automation_list` /
`_get` / `_list_node_types` / `_list_trigger_events` (reads), then
`automation_create` / `_update` (which pre-validate the graph with the exported
`validateGraph` against the live node registry, so the model gets an itemized fix
list instead of persisting something unrunnable), `_enable`, and `_test` +
`_get_run`. Automations are a single JSON graph blob written whole, so a
one-shot create/update tool fits better than incremental node/edge mutations.
