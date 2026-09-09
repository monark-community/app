# Data Model query language (MonarkQL)

A structured filter language over Data Model records, parallel to (and reusing) the
existing filter menu. Two front-ends ; the declarative filter menu and a text query
bar : read and write **one canonical query tree**, which the server compiles to SQL.
GitHub / Notion / Linear ship the same shape: a structured predicate tree, with the
text box as a serialization of it.

> **Where the code lives.** The generic, schema-agnostic language ; the AST, operator /
> `FilterableKind` taxonomy, text DSL, and `@variables` ; was extracted into the shared
> **[`@monark/query`](../../../packages/query/src/contracts)** library (also used by kanban).
> `@monark/data-models` depends on it and adds only the Data-Model binding: the
> `DataFieldType → FilterableKind` bridge (`filterableKindOf`, in its
> [`contracts/query.ts`](../../../packages/data-models/src/contracts/query.ts) adapter, which
> re-exports the generic API so `@monark/data-models/contracts` imports resolve unchanged)
> and the SQL compiler. This doc covers the Data-Model binding; the generic pieces are the
> same everywhere `@monark/query` is used.

This is deliberately **separate** from the [`FORMULA` field engine](../../../packages/data-models/src/contracts/formula.ts).
A formula is a per-record _compute_ (one scalar out of one loaded record, evaluated in
JS); a query is a _set selector_ (a predicate over the whole table, compiled to SQL).
They don't share a grammar ; one runs in JS over a single record, the other compiles to
a `WHERE` Postgres runs over every row.

## In this section

- **[The three pieces](the-three-pieces.md)**
- **[The AST](the-ast.md)**
- **[Why the compiler is raw SQL](why-the-compiler-is-raw-sql.md)**
- **[Text DSL syntax](text-dsl-syntax.md)**
- **[Dynamic variables](dynamic-variables.md)**
- **[Feature flag](feature-flag.md)**
- **[Relation traversal](relation-traversal.md)**
- **[Saved views](saved-views.md)**
- **[tRPC surface](trpc-surface.md)**
- **[Tests](tests.md)**
- **[Deferred](deferred.md)**
