# Automations reachable from the data they act on

> Phase D of the integration program. Independent of every other phase.
>
> **Source**: transcribes the approved program plan of 2026-09-07, re-verified against the code on
> 2026-09-10.

## Context

Nothing can answer **"which automations touch this model, or this record?"**

The trigger's `dataModelKey` lives inside `Automation.graph` JSON, unindexed. Action-side model
references are duplicated per node type (`data-create-record`, `data-update-record`,
`data-delete-record`, `data-find-record(s)`), each with its own config shape. The only reverse lookup
that exists is `findEnabledAutomationsForEvent(organizationId, eventType)` in
[`packages/automation/src/server/data.ts`](../../../packages/automation/src/server/data.ts), which
matches the indexed `triggerEventType` column and returns every automation on that event type across
**all** models ; model narrowing then happens in memory in `eventScopeMatches`
([`subscriber.ts`](../../../packages/automation/src/server/subscriber.ts)).

That in-memory narrowing **fails open** on a malformed graph or an unset key: a broken automation
currently matches _everything_ rather than nothing. That is the real defect here, and the index is
what closes it.

## Goals

- **A maintained reverse index** of which data models an automation reads or writes.
- **"Which automations touch this?"** answerable from a record, an article and the schema builder.
- **Close the fail-open**: a malformed graph matches nothing.

## Non-goals

- **Node-type-aware indexing in core.** The walker must not hard-code node types ; it is an
  extension point, not a switch statement.
- **Indexing record-level references.** The index is per _model_. Per-record run lookup is
  best-effort over `AutomationRun.triggerPayload`, which is deliberately unindexed.

## Data model

Under the automation banner in `base.prisma` (automation is core):

```prisma
enum AutomationRefRole { TRIGGER  ACTION }

/// Denormalized index of which data models an automation reads or writes.
/// Rebuilt from Automation.graph on every save ; never hand-edited.
model AutomationModelRef {
  id           String            @id @default(cuid())
  automationId String
  automation   Automation        @relation(fields: [automationId], references: [id], onDelete: Cascade)
  // Soft id, matching the house convention for cross-module references.
  dataModelId  String
  dataModelKey String
  role         AutomationRefRole
  nodeId       String

  @@unique([automationId, nodeId, dataModelId, role])
  @@index([dataModelId])
  @@index([automationId])
}
```

Maintained by a single `collectModelRefs(graph): ModelRef[]` walker in
`packages/automation/src/server/model-refs.ts`, called **inside the same transaction** as
`automations.create` / `automations.update`, and backfilled once at boot alongside
`hydrateDataModelRegistrations()`.

## The walker is an extension point

Add an optional `collectModelRefs?: (config) => { dataModelKey, role }[]` to the **server-side** node
definition in [`registry.ts`](../../../packages/automation/src/server/registry.ts), beside the
existing optional `collectVars`. (Note that `collectVars` lives on the server node def, not on the
serializable descriptor in `contracts/nodes.ts` ; only the descriptor crosses to the editor.)

**The default implementation needs no per-node work.** `contracts/nodes.ts` already has a
`"data-model"` config-field _type_, so the walker harvests every config field the node's descriptor
declares as `type: "data-model"` and labels it `ACTION`, or `TRIGGER` when the descriptor's kind is
`trigger`. A node implements `collectModelRefs` only when that default is wrong, for example when it
derives a model key rather than taking one from a picker.

## Closing the fail-open

With refs indexed, `eventScopeMatches` no longer needs to re-parse the graph per candidate:
`findEnabledAutomationsForEvent` gains an optional `dataModelId` that joins `AutomationModelRef` on
`role = TRIGGER`. Keep the graph parse only as an assertion outside production.

A malformed graph then matches **nothing** rather than everything, which is the correct direction for
a trigger predicate: a broken automation should stop firing, not fire on every event in the org.

## The affordances

- **`automation.automations.listForModel({ dataModelId, recordId? })`** returning the automations
  whose refs name that model, split into `triggeredBy` and `affects`, gated on `automation.view`.
  With `recordId`, additionally return recent `AutomationRun` rows whose `triggerPayload` names that
  record ; `triggerPayload` is unindexed, so scope the scan by `automationId in (...)` plus a
  `createdAt` window rather than scanning JSON globally.
- **`/automation` gains `?model=<key>` and `?record=<id>` filters**, read in `automations-list.tsx`.
- **An "Automations" action** on the record detail panel and the article header, linking to
  `/automation?model=<key>&record=<id>`, with a **count badge** so the affordance is honest when
  there are none. Hidden when the caller lacks `automation.view` or `automation.enabled` is off.
- **A blast-radius warning** in the Data Model schema builder: deleting a model, or archiving a field
  a flow references, warns with the list of affected automations instead of failing silently at run
  time. This is the highest-value use of the index and the one an operator notices.

## Big-5

No new permission (reuses `automation.view`), no new event, no notification, no new flag (rides
`automation.enabled`). i18n en and fr for the new labels ; the data-model section of
[`packages/automation/README.md`](../../../packages/automation/README.md) ; a CHANGELOG fragment.

## Edge cases and risks

- **Index divergence.** The index is derived state, so it can drift from the graph. Rebuilding it in
  the same transaction as the save is what prevents that ; the boot backfill is the repair path. An
  integration test must assert the table **converges** on create, update and delete, not merely that
  it is populated once.
- **A ref to a deleted model.** `dataModelId` is a soft id, so a deleted model leaves stale rows.
  The blast-radius warning is the mitigation on the way in ; a cleanup subscriber on
  `data-models.model-deleted` is the one on the way out.
- **Changing the match semantics is a behavior change.** Automations that currently fire on every
  event of a type because their graph is malformed will stop firing. That is the fix, and it is also
  a silent behavior change for anyone relying on it ; call it out in the changelog fragment
  explicitly rather than burying it as a bug fix.
- **Route names.** If [workspace-unification.md](workspace-unification.md) has landed, the record and
  article affordances link to `/workspace/...` rather than `/data/...` ; these two phases are
  independent but touch the same link-building code, so whichever lands second re-points the other's
  hrefs.

## Success metrics

- A flow with a trigger on model A and an update action on model B produces exactly one TRIGGER row
  for A and one ACTION row for B.
- Editing the graph converges the table.
- The record panel lists exactly the flows that touch it.
- A malformed graph matches nothing.
