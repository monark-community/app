---
type: decision
status: accepted
date: 2026-08-02
---

# 0007. Compile record queries to raw SQL

## Context

Data-model records keep their field values in one JSONB column, and MonarkQL turns a filter into a tree of conditions that must run in Postgres. Prisma offers a structured JSON `where` (`data: { path, gt }`) that would avoid writing SQL by hand. Two needs pushed against it. Text matching has to be case-insensitive, and Prisma's JSON filter has no case-insensitive mode. And the per-field indexes an admin can request are Postgres expression indexes, such as `((data->>'key')::numeric)`; the planner uses them only when a query uses exactly the same expression, which Prisma's JSON path filter doesn't generate. The compiler also has to apply record-level access, so whatever it produces is an authorization boundary.

## Options

| Option                                      | For                                                             | Against                                                                          |
| ------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Prisma's structured JSON `where`            | Typed, no hand-written SQL, injection-safe by construction      | No `ILIKE`; generates different expressions, so it misses the expression indexes |
| Load records and filter in application code | Any logic is possible                                           | Reads whole tables; breaks keyset pagination and totals                          |
| Compile the tree to a `Prisma.Sql` fragment | `ILIKE`, exact index expressions, `EXISTS` for relation filters | Hand-written SQL to keep safe; access rules must be mirrored in SQL              |

## Decision

`compileFilterToSql` in `@monark/data-models` turns the tree into a parameterized `Prisma.Sql` boolean fragment, written against the same expressions the index builder uses. Field keys are placed in the SQL as identifiers, which is safe because a key is validated once at creation (`^[a-z][a-z0-9_]*$`) and never changes. Every value is a bound parameter. Row-level access is expressed in the same SQL.

The deciding reason: only SQL written against the index expressions can use the indexes, and case-insensitive search needs `ILIKE`.

## Consequences

- Filtered lists stay on indexes, and relation filters compile to one `EXISTS` subquery with the target's access rules inside it.
- The classic filter menu was later converged onto the same compiler (2026-09-08), so there is one filter implementation and record-level access is applied in one place. That convergence made menu text matching case-insensitive and menu date matching a true same-day comparison; both only ever match more rows.
- Record scopes reuse the compiler, so a role's scope and a user's filter can't disagree.
- Keyset pagination (`updatedAt desc, id desc`) is reimplemented in SQL, with the cursor row's sort key resolved by a subquery.
- Kanban, with fixed columns, compiles the same tree to a typed Prisma `where` instead; raw SQL is specific to JSONB storage.
- Anyone changing the compiler must keep identifiers validated and values bound; there is no type system guarding the SQL.
