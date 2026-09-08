# The three pieces

| Layer                        | File                                                                                              | Role                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AST + taxonomy** (generic) | [`query/contracts/query.ts`](../../../packages/query/src/contracts/query.ts)                         | `FilterNode` tree (leaves + boolean groups), the operator vocabulary, and which operators are legal per `FilterableKind`. Pure, isomorphic, zod-validated.                    |
| **Text DSL** (generic)       | [`query/contracts/query-dsl.ts`](../../../packages/query/src/contracts/query-dsl.ts)                 | `parseQuery` (text → tree) + `printQuery` (tree → text), mirroring the formula engine's tokenizer → recursive-descent structure.                                              |
| **`@variables`** (generic)   | [`query/contracts/query-variables.ts`](../../../packages/query/src/contracts/query-variables.ts)     | `@me` / date anchors, resolved against a `QueryContext` at compile time.                                                                                                      |
| **Data-Model bridge**        | [`data-models/contracts/query.ts`](../../../packages/data-models/src/contracts/query.ts)             | `filterableKindOf` : `DataFieldType` (incl. `FORMULA` via its inferred result type) → `FilterableKind`. Re-exports the generic API.                                           |
| **SQL compiler**             | [`data-models/server/query-compiler.ts`](../../../packages/data-models/src/server/query-compiler.ts) | `compileFilterToSql(tree, fields)` → a boolean `Prisma.Sql` fragment, run by `listDataRecordsWithQuery` in [`server/data.ts`](../../../packages/data-models/src/server/data.ts). |

The tree is the canonical form. The menu and the text bar are two editors over it;
the compiler is the one execution path.
