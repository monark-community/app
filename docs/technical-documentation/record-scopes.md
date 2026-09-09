# Record scopes ; MonarkQL-scoped record permissions

A role can be granted access to **the records matching a condition**, written in
[MonarkQL](data-model-queries/_index.md), per data model. "Support sees only tickets in their region",
"a rep sees only their own deals", without a per-record ACL on every row.

This is the third and narrowest layer of record authorization. Read
[the Data Models capability page](platform-overview/3-core-capabilities/35-polymorphic-data-models-monarkdata-models.md)
for the first two.

## The three layers

| Layer               | Question                                        | Mechanism                                                                    |
| ------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Model               | May you touch this model's records at all ?     | `data-models.<key>-record-<verb>` or the generic `data-models.record-<verb>` |
| Row (explicit)      | Is this individual record shared with you ?     | `DataRecordRoleAccess` ; no rows = open to all model-accessors               |
| **Scope (by rule)** | **Do you match the condition for this model ?** | **`DataModelRoleScope` ; no rows = unrestricted**                            |

All three are AND-ed. All three are bypassed by `data-models.view-all-records`
(see [the identity model](identity-and-integration/_index.md) and the changelog for `2026-09-08`).

## The data model

```prisma
enum DataRecordScopeVerb { READ  WRITE  DELETE }

model DataModelRoleScope {
  id          String              @id @default(cuid())
  roleId      String              // -> Role, cascade
  dataModelId String              // -> DataModel, cascade
  verb        DataRecordScopeVerb
  query       Json                // a MonarkQL FilterNode tree
  createdBy   String
  @@unique([roleId, dataModelId, verb])
}
```

Migration `20260908160000_add_data_model_role_scopes`.

**Only `READ` is enforced today.** The column carries all three verbs so the schema is stable, but
the API rejects anything else (`ENFORCED_SCOPE_VERBS` in
[`server/scopes.ts`](../../packages/data-models/src/server/scopes.ts)). Exposing a verb the engine
ignores would be a configurable no-op, which is worse than not offering it ; write-side scoping needs
post-write revalidation inside a transaction, because a record must not be editable _out of_ its own
scope, and that is its own change.

Since READ governs visibility everywhere, and you cannot edit or delete what you cannot see, a READ
scope already gates the write paths.

## The rule that matters: roles are additive

The effective predicate is

> the **OR**, over every role the caller holds that **grants** the verb on this model,
> of that role's scope (or `TRUE` when that role has no scope row)

So:

- Holding one **unscoped granting role** leaves you unrestricted. A scope narrows only the access its
  own role confers.
- Two scoped roles **union** their scopes.
- A role that does not grant the verb contributes nothing, scoped or not.

This is the only semantic consistent with how the rest of RBAC works: roles grant, they never
subtract. The alternative (intersecting scopes) would mean adding a scope to one role silently
restricts a user who also holds a broader one, which is the opposite of what an admin expects when
they _add_ a grant.

`resolveRecordScope` implements this in two indexed queries: which of my roles grant the verb, and
which of my roles have a scope on this model.

## Where it is enforced

The point of a single enforcement seam is that a scope cannot mean one thing in a list and another on
a direct link. Everything funnels through `recordAccessContext`
([`server/router.ts`](../../packages/data-models/src/server/router.ts)), which now carries the
caller's compiled READ scope:

| Path                                                     | How                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `records.list`                                           | the scope is AND-ed into the filter tree and compiled by the **one** query compiler (see the A0 convergence, changelog `2026-09-08`) |
| `records.getById` / `update` / `delete` / watch / access | `assertRecordVisible`, which runs the same compiler against the single record                                                        |
| Global search                                            | `isRecordInScope` post-filters hits ; search reaches records without going through `records.list`, so it needs its own check         |
| Watcher fan-out                                          | same, per recipient, so a change notification cannot reveal a scoped-out record                                                      |
| Public API + MCP                                         | inherited for free, since both are facades over these same tRPC procedures                                                           |

A record hidden by a scope is a **404, never a 403**, exactly like a row-ACL-hidden record, so neither
its existence nor the shape of the scope leaks.

## Failure modes, and why they fail closed

A filter that silently stops filtering is an authorization bug, not a 400. So:

- **A stored scope that fails `filterQuerySchema`** resolves to "deny everything", not "no scope". A
  corrupted or hand-edited row hides records rather than exposing them.
- **A scope may not traverse a relation.** `upsertScope` rejects any dotted field. A traversal reads
  the _target_ model, so its evaluation could depend on rows the scoped role cannot see, and it would
  need the target's own row-access threaded into a predicate that runs before we know which record we
  are judging. Refusing it up front is a smaller, checkable rule than getting that right.
- **A scope names a field the model does not have**: rejected at save time, because `set` parses the
  text against the model's live fields. A scope that references a field archived or retyped _later_
  fails to compile at query time, and errors rather than returning unfiltered rows.

## Who may configure one

`data-models.manage-record-scopes`, deliberately **not** `manage-schema`.

A scope is an authorization control, so whoever can delete one can widen their own access. Letting a
data steward do that would undo the separation that `view-all-records` established in the first
place. Admins hold it by short-circuit.

Both changes emit audit events, `data-models.record-scope-set` and `-cleared`, carrying the model,
role, verb and actor ; subscribe to them and every widening or narrowing is visible without polling
the table.

## Performance

The scope is one more predicate on a query that already runs, compiled against the same expression
indexes the filter compiler targets, so a scoped list costs about what a filtered list costs. Prefer
scoping on a field with `DataField.indexed` set.

The fan-out paths (search, watchers) keep a fast path: `modelHasAnyScope` is a single indexed lookup,
and a model nobody has scoped does no extra per-user work at all.

## tRPC surface

`dataModels.scopes.{list, listForRole, set, clear}`, all gated on
`data-models.manage-record-scopes`.

**The wire format is MonarkQL text, not a tree**, in both directions.

- `set` takes `{ dataModelId, roleId, verb, query: string }` and **parses it server-side against the
  model's real fields**, so an unknown or wrongly-typed field is a clear error at save time rather
  than a query that breaks later. It also rejects traversal, an empty query (a scope that narrows
  nothing is not a scope ; clearing one is `clear`, which says so), and a role belonging to another
  organization.
- `list` / `listForRole` return the **canonical printed text**. Returning `Prisma.JsonValue` instead
  would push a recursive type through tRPC's client inference, which is expensive enough to trip
  `TS2589` in the web app ; text is also simply what a caller wants to render or re-edit. A stored
  tree that no longer parses renders as `(unreadable scope)` rather than throwing, so one broken row
  cannot break the whole screen. The **enforcement** path still fails closed on it, which is where it
  matters.
- `listForRole` exists so the role editor can render its section in one request instead of one per
  database.

## Configuring one

`/admin/rbac` → a role → **Record scopes**
([`role-scopes-section.tsx`](<../../services/web/src/app/(authed)/admin/rbac/role-scopes-section.tsx>)).

Edit-mode only: a scope hangs off a role id, so there is nothing to attach it to until the role
exists. It saves immediately rather than joining the role form's dirty state, because it is a
separate resource with its own permission ; this mirrors `RecordAccessSection`, which does the same
for the per-record ACL. Built-in ADMIN is excluded, since it bypasses every scope and the section
would be a control that does nothing.

Only databases the role can actually read are listed. Scoping one the role has no `record-read` on
would be a rule with nothing to narrow. The query is written with the same `QueryChipBar` the record
list uses, so the language is learned once.

## Tests

[`tests/integration/record-scopes.test.ts`](../../packages/data-models/tests/integration/record-scopes.test.ts)
covers the narrowing, the 404-not-403 invariant, the write paths, the additive rule, `@me` resolving
per caller, both bypasses, the fail-closed parse, the traversal rejection, the search side door, and
that a `manage-schema` holder cannot manage scopes.
