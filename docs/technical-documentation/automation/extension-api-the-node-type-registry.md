# Extension API : the node-type registry

The load-bearing extension point ([registry.ts](../../../packages/automation/src/server/registry.ts)):

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
- `defineNode` erases the config generic into a uniform `run(ctx, rawConfig)` that parses config against `configSchema` before calling `execute` ; so the registry is heterogeneous without `any`, and a bad config fails just that node's step.
- The full definition (descriptor + schema + `execute`) lives server-side. `trpc.automation.nodeTypes.list` projects only the serializable `AutomationNodeDescriptor` (kind / category / label / ports / `configFields`) to the editor palette ; `execute` never crosses to the client.
- Core ships its built-ins through the same API ([nodes/](../../../packages/automation/src/server/nodes)): the Event Trigger; control-flow nodes (`condition` true/false branch, `constant`, `transform` ; a formula via the shared `tryEvaluateFormula` engine, `delay`); communication nodes (`notification`, `send-email`, `webhook`); Data nodes (`data-create-record` / `-update-` / `-delete-` / `-find-record`, plus `data-find-records` which queries by a field filter); RBAC nodes (`rbac-assign-role`, `rbac-remove-role`); and user nodes (`user-get`, `user-set-metadata`, `user-update-profile`, `user-set-active` deactivate/reactivate). A `user`-typed config field renders as an org-member picker (via `automation.members.list`), and a `data-model` field as a model picker.

`NodeExecutionContext` gives a node the org, the **owner identity** the run acts as (`Automation.createdBy`), the triggering event, and the outputs of upstream nodes. **Privileged nodes re-check the owner's capability at execution time** via `requireOwnerPermission(ctx, "<permission>")` ([nodes/shared.ts](../../../packages/automation/src/server/nodes/shared.ts)) ; the data nodes require `data-models.record-{write,read,delete}`, the RBAC nodes require `rbac.assign-role`, and the metadata node requires `users.write-metadata-for-module-<module>`. A run whose owner is gone (null) is denied outright. This keeps an automation from escalating beyond what its author could do by hand.

**Secrets** : `ctx.getSecret(name)` resolves one of the running automation's org's encrypted secrets ([`@monark/secrets`](../secrets/_index.md)), or `null`. Author-side, a `secret`-typed config field renders as a name picker (via `automation.secrets.list`, gated on `automation.view`) and stores the secret's **name** ; so the plaintext never reaches the editor or the persisted run config. The value is decrypted server-side only for the node's own outbound call; it must never be `ctx.log`-ed or returned as node output. Outbound HTTP from a node goes through `safeFetch` ([`@monark/common/http`](../../../packages/common/src/http.ts)), which applies the same scheme/host guard as the webhook node and an abort timeout.
