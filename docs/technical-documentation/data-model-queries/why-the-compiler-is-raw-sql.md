# Why the compiler is raw SQL

`compileFilterToSql` emits `Prisma.Sql`, not Prisma's structured JSON `where`, for two
reasons:

1. **Case-insensitive text** needs `ILIKE`, which the structured JSON filter has no
   `mode` for.
2. The opt-in per-field indexes in [`indexing.ts`](../../../packages/data-models/src/server/indexing.ts)
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
([`contracts/query.ts`](../../../packages/data-models/src/contracts/query.ts)) and executed by
`listDataRecordsWithQuery`, exactly like a query-bar tree; `listDataRecords` is now only the
plain, unfiltered keyset list. There is no second filter implementation to keep in step, which
matters because row-level access is applied in the compiled path and a divergence there is a
silent authorization bug rather than a cosmetic one.

Two semantics deliberately improved in that convergence, both of which only ever match _more_
rows: menu text matching became case-insensitive (`string_contains` -> `ILIKE`), and menu date
matching became a real same-calendar-day comparison (`::date = ::date`) instead of a substring
match against the stored ISO string.
