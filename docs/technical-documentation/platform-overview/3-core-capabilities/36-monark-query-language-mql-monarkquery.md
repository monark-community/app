# 3.6 Monark Query Language ; MQL (`@monark/query`)

A shared, schema-agnostic query package. Consumers map their own field types onto a `FilterableKind` and supply a per-field compiler ; used today by **Data Models** and **Kanban**.

- **AST**: `FilterNode` = predicate leaves (`{field, op, value}`) + boolean groups (`and`/`or`, negatable), with node-count (100) and depth (8) caps and a recursive zod wire schema.
- **Operators / kinds**: a taxonomy of ops (`is/contains/eq/gt/between/isAnyOf/hasAllOf/isEmpty/…`) legal per `FilterableKind` (`text, number, boolean, date, select, orderedSelect, multiSelect, relation, attachments`).
- **Text DSL**: `parseQuery` / `printQuery` round-trip a GitHub/Linear-flavored syntax (`status:open -assignee:present`, `priority:>=high`, `tags:&a,b`, `due:2026-01-01..2026-06-01`).
- **`@variables`**: `@me`, `@today`, `@startOfWeek`, … resolved at compile time against the caller + "now" (UTC).
- **Compilation**: Data Models compiles the tree to raw `Prisma.Sql` (case-insensitive `ILIKE`, hits the expression indexes, one-level relation traversal via `EXISTS`) ; Kanban compiles to a typed Prisma `where`. Field keys are interpolated as validated identifiers ; values are always bound parameters ; row-level access is preserved in the compiled path.
- **Saved views**: `DataRecordView` (personal or shared). Gated by flag `data-models.query-language` (default off).
