---
type: concept
---

# How automations run

An automation (a flow) is a graph: one trigger node wired to action nodes. When the trigger fires, Monark doesn't run the flow on the spot. It writes a run to a durable queue, and a background worker executes it, as the person who owns the flow. Runs survive restarts and never slow down the action that triggered them.

## The graph

A flow is stored as one JSON graph of nodes and edges, validated when saved and again before every run. Edges carry control flow only: which node runs after which, and which branch of a multi-output node was taken. Values move between nodes by reference, described under [Data between steps](#data-between-steps).

Node types come from a registry: any module registers its own at boot, each with a descriptor, a settings schema and a server-side `execute` function. Kanban, wiki and integration modules add nodes this way; the shipped catalog is in [Automation nodes](../reference/automation-nodes.md), and [Build on Monark](../build/_index.md) covers adding one.

## Triggers

| Trigger     | Fires when                                                                       |
| ----------- | -------------------------------------------------------------------------------- |
| Event       | a matching domain event is emitted anywhere in the platform                      |
| Data Record | a record of one chosen data model is created, updated or deleted                 |
| Manual      | someone clicks **Run now**                                                       |
| HTTP        | an outside system posts to the flow's URL with its secret                        |
| Schedule    | a recurring time comes round (every N minutes, daily, weekly or monthly, in UTC) |

Event triggers listen to every event on the bus except two kinds: automation's own events, so a flow can't re-trigger itself forever, and feature-flag changes, whose target organization can't yet be resolved reliably. An event is matched to organizations by its organization id, else by the acting user's memberships.

The worker checks for due schedules on every tick; an operator cron endpoint does the same as a fallback.

## Execution

```
 event / Run now / HTTP / schedule
          │  cheap: find matching enabled flows, insert one PENDING run each
          ▼
   AutomationRun (the outbox)
          │  worker, every 5 s: claim PENDING → RUNNING (only one worker wins)
          ▼
   engine: order the graph, run each node, record a step per node
          │
   SUCCEEDED ── or ── retry with backoff ── or ── FAILED after 3 attempts
```

The trigger side only inserts rows, so a failing flow never delays or rolls back the request that emitted the event. The status-guarded claim makes the worker safe across several API processes. It's the same outbox-and-worker shape the webhook delivery worker uses; see [Run automations from a durable outbox](../decisions/0004-run-automations-from-a-durable-outbox.md).

The engine orders the nodes reachable from the trigger topologically and refuses a graph with a cycle. A node that another node references, such as a Constant, is pulled into the run and ordered before its consumer even with no control edge into it. Each executed node leaves a run step with its input, output, logs and error, which is what **Run history** shows.

### Branches

A node fires all its outputs by default. A Condition node fires only `true` or `false`; nodes reachable only through the branch not taken are marked skipped, and so is everything after them.

### Errors and retries

A node can have an **Error output**. When it does, a failure is caught, the node's output becomes `{ error: message }`, and the flow continues down that branch. Without one, the failure fails the run.

A failed run goes back to pending with exponential backoff (10 seconds, doubling, at most 5 minutes). The retry picks up at the node that failed: nodes that already succeeded aren't run again. After the third failed attempt the run is marked failed. The worker emits run-started, run-succeeded and run-failed events, which webhooks can subscribe to (flows can't, as noted under Triggers).

### Delays

A Delay node suspends the run: its step is recorded as succeeded, and the run is rescheduled for later without using up a retry. On resume, the engine rebuilds its state from the recorded steps (outputs, which branches were taken, variables) and carries on from where it stopped. A delay survives a restart and never holds a worker.

### Loops

A For Each node runs the sub-graph on its "each item" output once per list item (up to 1,000), then continues on "done" with every iteration's result.

## Runs act as the flow's owner

Every run executes as the user who created the flow. Nodes that change things (record writes, role changes, user updates) check at run time that the owner still holds the matching permission, and data nodes respect the owner's record access. A flow can never do more than its author could by hand, and if the owner loses a permission, their flows lose it too. A run whose owner no longer exists is denied.

## Data between steps

Any text setting can contain `{{ path }}` references, resolved against this scope when the node runs:

| Reference                    | Holds                                                 |
| ---------------------------- | ----------------------------------------------------- |
| `{{ trigger.<field> }}`      | the triggering event's payload                        |
| `{{ steps.<name>.<field> }}` | an earlier node's output, by the node's editable name |
| `{{ vars.<name> }}`          | a workflow variable written by a Set Variable node    |

A setting that is only a reference keeps the value's type (a number stays a number); a reference inside other text is turned into text. Each node declares the fields it outputs, and the editor's variable picker lists them, so authors insert references by clicking rather than typing paths. Dropdowns, switches and number boxes can switch into variable mode to take a reference.

Workflow variables are one flat, run-wide bag: set a value on either arm of a branch and read it after they meet. They're replayed from recorded steps on resume, so they survive a delay. There is no expression language inside `{{ }}`; computed values come from a Transform node. Why data moves by reference and not along wires is in [Pass automation data by reference, not by wire](../decisions/0008-pass-automation-data-by-reference.md).

Nodes can also read organization secrets by name, so credentials never sit in a flow's settings; see [Secrets](secrets.md).

## Limits

- A flow has exactly one trigger.
- References are paths only, with no operators or functions, and they aren't type-checked before a run.
- Inside a For Each body there is no Delay and no nested For Each.
- A failure inside a For Each body, without an error output, re-runs the whole loop from the first item on retry.
- Schedules are in UTC.

## Related

- [Automations](../use/automations/_index.md): building and testing flows in the app
- [Automation nodes](../reference/automation-nodes.md)
- [Run automations from a durable outbox](../decisions/0004-run-automations-from-a-durable-outbox.md)
- [Pass automation data by reference, not by wire](../decisions/0008-pass-automation-data-by-reference.md)
- [automation package README](../../packages/automation/README.md)
