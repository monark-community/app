# @monark/query

Monark Query Language (**MonarkQL**) : a canonical, schema-agnostic query model plus its text DSL and autocomplete. A query is a tree of predicate leaves and boolean groups that every editor (a declarative filter menu, a text query bar) reads and writes, and that each consuming module compiles to its own storage query (a Prisma `where`, raw SQL, …).

Pure and isomorphic : no runtime dependency but `zod`, no framework, no DB access ; the same code runs on the server (compile + resolve) and in the browser (parse, print, autocomplete). It is **generic over a `FilterableKind` taxonomy** and knows nothing about any concrete schema — a consumer maps its own field types onto a kind and supplies a per-field compiler. Used today by [`@monark/data-models`](../data-models/README.md) (maps `DataFieldType` → kind, compiles to `Prisma.Sql`) and [`@monark/kanban`](../kanban/README.md) (maps card columns, compiles to a Prisma `where`).

## What lives here

Everything is under `src/contracts/`, re-exported from the single `./contracts` barrel.

- **AST + taxonomy** ([`src/contracts/query.ts`](src/contracts/query.ts)); the `FilterNode` tree, the operator vocabulary, the `FilterableKind` axis, and the zod wire schema.
- **Text DSL** ([`src/contracts/query-dsl.ts`](src/contracts/query-dsl.ts)); `parseQuery` (text → tree) and `printQuery` (tree → text), a round-trippable GitHub/Linear-flavoured syntax.
- **Query variables** ([`src/contracts/query-variables.ts`](src/contracts/query-variables.ts)); `@me` / `@today` / relative-date anchors resolved at compile time against the caller + "now".
- **Autocomplete** ([`src/contracts/query-complete.ts`](src/contracts/query-complete.ts)); `getCompletions`, the caret-aware suggestion engine behind the query bar.

## Key concepts

**Filterable kinds.** Every field collapses to one of nine kinds ; the legal operators and text-DSL semantics follow from the kind alone :

`text`, `number`, `boolean`, `date`, `select` (unordered fixed set), `orderedSelect` (fixed set with a meaningful order, so it also allows comparisons like `>= HIGH`, resolved by expanding the range to the field's declared option order), `multiSelect`, `relation`, `attachments`.

`legalOps(kind)` returns the operators offered for a kind in menu order (first = default) ; `defaultOpForKind(kind)` is the op a bare `field:value` means ; `isOpLegal(kind, op)` is the guard the compiler and input validator use.

**Operators.** 26 in `FILTER_OPS`, named for the user-facing verb, spanning equality/text (`is`, `contains`, `startsWith`, …), number (`eq`, `gt`, `between`, …), date (`before`, `onOrAfter`, …), boolean (`isTrue`/`isFalse`), set membership (`isAnyOf`, `hasAllOf`, `hasNoneOf`, …), and presence (`isEmpty`/`isNotEmpty`). `opValueArity(op)` gives each op's value shape : `none` (unary), `scalar` (one), `list` (any number), or `pair` (exactly two, for `between`).

**AST.** A `FilterLeaf` (`{ kind: "leaf", field, op, value? }` ; `value` is a string for `scalar`, `string[]` for `list`/`pair`, absent for `none`) or a `FilterGroup` (`{ kind: "group", combinator: "and" | "or", negate?, children }`). Values are always string-encoded on the wire ; the consuming compiler coerces per the field's kind. Build nodes with `leaf(field, op, value?)` and `group(combinator, children, negate?)` ; fold a tree with `walkFilter(node, visitor)`. Backstops : `MAX_FILTER_NODES` (100) and `MAX_FILTER_DEPTH` (8). `filterQuerySchema` is the recursive zod validator that enforces both caps — consumers accept this shape at the tRPC boundary.

**Text DSL.** `parseQuery(input, kinds)` → `FilterNode | null` and `printQuery(node, kinds)` → string round-trip through a caller-supplied `FieldKinds` map (`fieldKindsFrom([{ key, kind }])`). An unknown field or an operator illegal for the field's kind throws `QuerySyntaxError`. Syntax :

| Form                             | Meaning                                          |
| -------------------------------- | ------------------------------------------------ |
| `field:value`                    | the field kind's default op                      |
| `field:a,b`                      | a list (any-of for select / multi-select)        |
| `field:=value`                   | explicit equality (text exact, case-insensitive) |
| `field:>v` `>=` `<` `<=`         | comparison (number : `gt`… ; date : `after`…)    |
| `field:~v` `!~` `^` `$`          | contains / notContains / startsWith / endsWith   |
| `field:&a,b`                     | has-all-of (multi-select)                        |
| `field:a..b`                     | between (number / date)                          |
| `field:empty` \| `field:present` | is-empty / is-not-empty                          |
| `field:true` \| `field:false`    | boolean                                          |
| `-field:...`                     | negation                                         |
| `a b`                            | implicit AND ; `a OR b` ; `( … )` groups         |

**Variables.** `QUERY_VARIABLES` lists 11 tokens — `@me`, `@now`, `@today`, `@yesterday`, `@tomorrow`, `@startOfWeek`, `@endOfWeek`, `@startOfMonth`, `@endOfMonth`, `@startOfYear`, `@endOfYear`. A leaf carries the raw `@token` string (the parser/printer treat it like any value) ; `resolveQueryVariable(token, ctx)` swaps it for a concrete value at compile time (dates → ISO string, `@me` → the caller's user id, unknown → `null`). All date math is UTC ; weeks are Monday-based. `variablesForKind(kind)` returns the tokens relevant to a kind (date vars for `date`, user vars for `relation`) for autocomplete.

**Relation traversal (one level).** A dotted field key (`assignee.title`) filters a related record's field. `collectTraversalRelationKeys(node)` returns the set of relation keys a tree traverses, so a compiler can pre-resolve the targets (each consumer implements the actual `EXISTS`/join). Traversal is a single level.

**Autocomplete.** `getCompletions(text, caret, fields, opts?)` returns ranked `Completion`s — fields, operators, values, `@variables`, and boolean keywords — each with the exact `[replaceStart, replaceEnd]` range to splice, so mid-string editing works. Operator/variable labels are language-neutral DSL tokens plus an English `detail` ; pass `describeOp` / `describeVariable` in `CompletionOptions` to localize without the engine depending on any i18n runtime.

## Public entry point

Single subpath — the package is contracts-only (no `/server` or `/client`).

| Import path               | What it exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@monark/query/contracts` | the AST + ops/kinds (`FilterNode`, `FILTER_OPS`, `FilterableKind`, `legalOps`, `defaultOpForKind`, `isOpLegal`, `opValueArity`, `leaf`, `group`, `walkFilter`, `collectTraversalRelationKeys`, `MAX_FILTER_NODES`, `MAX_FILTER_DEPTH`, `filterQuerySchema`), the text DSL (`parseQuery`, `printQuery`, `QuerySyntaxError`, `FieldKinds`, `fieldKindsFrom`, `dslPrefixForOp`, `matchDslPrefix`), the variables (`QUERY_VARIABLES`, `QueryContext`, `resolveQueryVariable`, `isQueryVariable`, `variablesForKind`), and the completion engine (`getCompletions`, `Completion`, `CompletionField`, `CompletionOptions`) |

## Usage

A consumer resolves its own field types to a `FilterableKind`, then parses / validates / compiles :

```ts
import {
  fieldKindsFrom,
  parseQuery,
  filterQuerySchema,
  type FilterNode,
} from "@monark/query/contracts";

// 1. Map your schema onto filterable kinds.
const kinds = fieldKindsFrom([
  { key: "status", kind: "select" },
  { key: "assignee", kind: "relation" },
  { key: "due", kind: "date" },
]);

// 2a. Text bar → tree (throws QuerySyntaxError on an unknown field / illegal op).
const tree = parseQuery("status:open -assignee:present due:@startOfWeek..@endOfWeek", kinds);

// 2b. Or accept a tree from the filter menu at the tRPC boundary.
const validated: FilterNode = filterQuerySchema.parse(input);

// 3. Compile `tree`/`validated` to your storage query in your own /server layer,
//    resolving @variables with resolveQueryVariable(token, { userId, now }).
```

The compilation step lives in each consumer (`@monark/data-models`'s `query-compiler.ts` → `Prisma.Sql` ; `@monark/kanban`'s `query-compiler.ts` → Prisma `where`), because the target storage differs ; this package owns only the shared, storage-neutral model.

## Consumers & gating

- **`@monark/data-models`** — bridges `DataFieldType` → `FilterableKind` (`filterableKindOf`) and compiles to raw `Prisma.Sql` so text filtering is case-insensitive and hits the per-field expression indexes ; gated by the `data-models.query-language` flag (default off).
- **`@monark/kanban`** — maps card columns (`status`/`assignee`/`reviewer`/`priority`/`due`/…) and compiles to a typed Prisma `where` ; gated by the `kanban.query` flag (default off).

Both flags live in the consumer packages ; `@monark/query` itself is never flag-gated (it has no runtime side effects).

## Dependencies

- `zod` (the `filterQuerySchema` wire validator) — the only runtime dependency. No DB, no framework, no i18n runtime.
