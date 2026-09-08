# Data Model query language (MonarkQL)

A structured filter language over Data Model records, parallel to (and reusing) the
existing filter menu. Two front-ends ; the declarative filter menu and a text query
bar : read and write **one canonical query tree**, which the server compiles to SQL.
GitHub / Notion / Linear ship the same shape: a structured predicate tree, with the
text box as a serialization of it.

> **Where the code lives.** The generic, schema-agnostic language ; the AST, operator /
> `FilterableKind` taxonomy, text DSL, and `@variables` ; was extracted into the shared
> **[`@monark/query`](../../packages/query/src/contracts)** library (also used by kanban).
> `@monark/data-models` depends on it and adds only the Data-Model binding: the
> `DataFieldType → FilterableKind` bridge (`filterableKindOf`, in its
> [`contracts/query.ts`](../../packages/data-models/src/contracts/query.ts) adapter, which
> re-exports the generic API so `@monark/data-models/contracts` imports resolve unchanged)
> and the SQL compiler. This doc covers the Data-Model binding; the generic pieces are the
> same everywhere `@monark/query` is used.

This is deliberately **separate** from the [`FORMULA` field engine](../../packages/data-models/src/contracts/formula.ts).
A formula is a per-record _compute_ (one scalar out of one loaded record, evaluated in
JS); a query is a _set selector_ (a predicate over the whole table, compiled to SQL).
They don't share a grammar ; one runs in JS over a single record, the other compiles to
a `WHERE` Postgres runs over every row.

## The three pieces

| Layer                        | File                                                                                              | Role                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AST + taxonomy** (generic) | [`query/contracts/query.ts`](../../packages/query/src/contracts/query.ts)                         | `FilterNode` tree (leaves + boolean groups), the operator vocabulary, and which operators are legal per `FilterableKind`. Pure, isomorphic, zod-validated.                    |
| **Text DSL** (generic)       | [`query/contracts/query-dsl.ts`](../../packages/query/src/contracts/query-dsl.ts)                 | `parseQuery` (text → tree) + `printQuery` (tree → text), mirroring the formula engine's tokenizer → recursive-descent structure.                                              |
| **`@variables`** (generic)   | [`query/contracts/query-variables.ts`](../../packages/query/src/contracts/query-variables.ts)     | `@me` / date anchors, resolved against a `QueryContext` at compile time.                                                                                                      |
| **Data-Model bridge**        | [`data-models/contracts/query.ts`](../../packages/data-models/src/contracts/query.ts)             | `filterableKindOf` : `DataFieldType` (incl. `FORMULA` via its inferred result type) → `FilterableKind`. Re-exports the generic API.                                           |
| **SQL compiler**             | [`data-models/server/query-compiler.ts`](../../packages/data-models/src/server/query-compiler.ts) | `compileFilterToSql(tree, fields)` → a boolean `Prisma.Sql` fragment, run by `listDataRecordsWithQuery` in [`server/data.ts`](../../packages/data-models/src/server/data.ts). |

The tree is the canonical form. The menu and the text bar are two editors over it;
the compiler is the one execution path.

## The AST

```ts
type FilterLeaf = { kind: "leaf"; field: string; op: FilterOp; value?: string | string[] };
type FilterGroup = {
  kind: "group";
  combinator: "and" | "or";
  negate?: boolean;
  children: FilterNode[];
};
type FilterNode = FilterLeaf | FilterGroup;
```

Values are always **string-encoded** on the wire (a scalar for most ops, a `string[]`
for set membership, exactly two for `between`); the compiler coerces per the field's
kind. The wire schema (`filterQuerySchema`) caps total nodes (100) and nesting depth (8)
so an adversarial input can't drive unbounded recursion or a monster SQL `where`.

### Operator taxonomy

The 15 field types collapse into a few **filterable kinds** (`filterableKindOf`); each
kind offers a fixed operator set (`legalOps`). A `FORMULA` field filters as whatever its
expression yields (resolved through `inferResultType`).

| Kind        | Types                                  | Operators                                                                   |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------- |
| text        | TEXT, LONG_TEXT, RICH_TEXT, URL, EMAIL | is, isNot, contains, notContains, startsWith, endsWith, isEmpty, isNotEmpty |
| number      | NUMBER                                 | eq, neq, gt, gte, lt, lte, between, isEmpty, isNotEmpty                     |
| boolean     | BOOLEAN                                | isTrue, isFalse                                                             |
| date        | DATE, DATETIME                         | is, before, after, onOrBefore, onOrAfter, between, isEmpty, isNotEmpty      |
| select      | SELECT                                 | isAnyOf, isNoneOf, isEmpty, isNotEmpty                                      |
| multiSelect | MULTI_SELECT                           | hasAnyOf, hasAllOf, hasNoneOf, isEmpty, isNotEmpty                          |
| relation    | RELATION                               | isAnyOf, isEmpty, isNotEmpty                                                |
| attachments | FILE, ATTACHMENTS                      | isEmpty, isNotEmpty                                                         |

## Why the compiler is raw SQL

`compileFilterToSql` emits `Prisma.Sql`, not Prisma's structured JSON `where`, for two
reasons:

1. **Case-insensitive text** needs `ILIKE`, which the structured JSON filter has no
   `mode` for.
2. The opt-in per-field indexes in [`indexing.ts`](../../packages/data-models/src/server/indexing.ts)
   are **expression indexes** : `((data->>'key')::numeric)`, `::timestamptz`, GIN on
   `data->'key'`. Only a query written against the _same_ expressions uses them; Prisma's
   `data: { path, gt }` form generates a different extraction and misses them.

Field keys are interpolated as identifiers (Postgres can't bind a json path key), which
is safe because a `DataField.key` is validated once at creation (`^[a-z][a-z0-9_]*$`) and
is immutable : the same guarantee `indexing.ts` relies on to build raw DDL. Every _value_
is bound as a parameter, never interpolated.

`listDataRecordsWithQuery` keeps the shared **keyset pagination** contract (`updatedAt
desc, id desc`, cursor = last row's id) so `usePaginatedList` / `Paginated<T>` work
unchanged; the cursor row's sort key is resolved via a subquery so a bare id stays a
valid cursor. The role-access predicate mirrors `recordRoleAccessWhere` as SQL, so RBAC
row-level scoping is identical to the structured path.

**Both front-ends now run the one compiler.** The classic filter menu's flat
`fieldFilters` are translated into a `FilterNode` by `fieldFiltersToFilterNode`
([`contracts/query.ts`](../../packages/data-models/src/contracts/query.ts)) and executed by
`listDataRecordsWithQuery`, exactly like a query-bar tree; `listDataRecords` is now only the
plain, unfiltered keyset list. There is no second filter implementation to keep in step, which
matters because row-level access is applied in the compiled path and a divergence there is a
silent authorization bug rather than a cosmetic one.

Two semantics deliberately improved in that convergence, both of which only ever match _more_
rows: menu text matching became case-insensitive (`string_contains` -> `ILIKE`), and menu date
matching became a real same-calendar-day comparison (`::date = ::date`) instead of a substring
match against the stored ISO string.

## Text DSL syntax

```
field:value                 default op for the field's kind
field:a,b                   a list (any-of for select / multi-select)
field:=value                explicit equality (text exact, case-insensitive)
field:>value  >= < <=       comparison (number: gt…; date: after…)
field:~value  !~ ^ $        contains / notContains / startsWith / endsWith
field:&a,b                  has-all-of (multi-select)
field:a..b                  between (number / date)
field:empty | field:present presence (is-empty / is-not-empty)
field:true | field:false    boolean
-field:...                   negation ( -field:a,b → none-of )
relation.subField:value      traverse a relation ( one level )
a b        (implicit AND)    a OR b        ( parentheses group )
```

`parseQuery` / `printQuery` take a `FieldKinds` map (field key → kind, the same metadata
the compiler and autocomplete read), so an unknown field or an operator illegal for the
field's kind is a `QuerySyntaxError`. The pair is a true inverse on normalized trees
(single-child non-negated groups collapse to their child).

## Dynamic variables

A value may be a `@variable` ([`query/contracts/query-variables.ts`](../../packages/query/src/contracts/query-variables.ts)), resolved at **compile time** against a `QueryContext` (`{ userId, now }`) so a saved query means the right thing for whoever runs it, whenever:

- `@me` ; the caller's user id (use on a relation / user field: `assignee:@me`).
- `@now`, `@today`, `@yesterday`, `@tomorrow`, `@startOfWeek`, `@endOfWeek`, `@startOfMonth`, `@endOfMonth`, `@startOfYear`, `@endOfYear` ; UTC date anchors. Compose a relative range with `between`: `due:@startOfWeek..@endOfWeek`.

The AST stores the raw `@token` string (the parser/printer treat it like any value); the compiler swaps it for a concrete bound value via `resolveQueryVariable`, and an unknown or unsupplied-context variable is a 400. The router supplies `{ userId: ctx.userId, now: new Date() }`.

## Feature flag

The whole language is gated behind `data-models.query-language` (default **off**). Off,
the record list falls back to the classic filter menu.

## Relation traversal

A dotted field filters through a relation : `assignee.title:alice` matches records whose
related record satisfies the sub-condition. The AST needs no new shape ; the leaf's
`field` is just `"assignee.title"`; the compiler splits on the dot. It compiles to an
`EXISTS` over the target model's `DataRecord`s:

```sql
EXISTS (SELECT 1 FROM "DataRecord" t
        WHERE t."dataModelId" = <targetModelId>
          AND t."deletedAt" IS NULL
          AND <id-membership>            -- t.id = r.data->>'assignee' (ONE) or IN the array (MANY)
          AND <target role-access on t>  -- so traversal can't surface unreadable rows
          AND <sub-condition on t.data>)
```

The column root is parameterized (`r.data` for the outer record, `t.data` inside the
subquery) so the outer relation value stays unambiguous under the alias shadow. Safety:
the router (`buildRelationTargets`) only resolves DATA_MODEL relations in the caller's
org, requires the caller can **read** the target model (else 403), and threads the
target's **row-level** role-access into the subquery ; so a traversal can't reveal a
related record the caller couldn't open directly. **One level only** (`a.b`, not
`a.b.c`); SYSTEM_MODEL relation targets aren't traversable. The web query bar gets the
dotted fields as "virtual" entries from `dataModels.records.queryFields`, so they parse +
autocomplete like any field.

## Saved views

A saved view is a named query tree per model (`DataRecordView` ; a core table under the
data-models banner in `base.prisma`, migration `20260802140000_add_data_record_views`).
Personal by default (`createdBy` is the owner); `shared = true` makes it visible to
everyone with read access to the model. The tRPC surface `dataModels.views.{list, create,
update, delete}` gates reading on `data-models.record-read` and scopes editing to the
owner (a shared view is still only editable by its creator). The stored `query` is
validated with `filterQuerySchema` on write; a view that references a since-removed field
simply errors when the compiler rejects it at run time ; nothing to migrate. The web
`ViewsMenu` loads a view by printing its tree back to query text, and saves the current
tree (with an optional share toggle).

## tRPC surface

`dataModels.records.list` accepts an optional `filter` (the `filterQuerySchema` tree)
alongside the legacy `fieldFilters`. When `filter` is present it takes precedence; otherwise
`fieldFilters` are translated into the same tree. Either way exactly one path runs. Read-only ; no new permission/event/notification (the
existing `data-models.record-read` gate and record role-access still apply). Saved views
live under `dataModels.views.*` (see above).

## Tests

- `tests/query.test.ts` ; taxonomy + schema (unit).
- `tests/query-dsl.test.ts` ; parser, printer, round-trip (unit).
- `tests/integration/query-language.test.ts` ; every operator family, groups, negation,
  and the keyset pagination contract against a real Postgres testcontainer.

## Deferred

The full plan (structured core, text DSL, query bar, variables, saved views, relation
traversal) has shipped. Possible future extensions: multi-level traversal (`a.b.c`),
SYSTEM_MODEL relation targets, and relevance ranking on text search.
