---
type: concept
---

# Data models and queries

A data model is a record type an admin defines at runtime, with no deploy: Projects, Clients, Feature requests. Every model's records live in one shared table, each record's field values in a single JSON column. A query is a tree of conditions that the server compiles to one SQL `WHERE` clause over that table, and the same tree drives filtering, saved views and record-level permissions.

## Models, fields and records

| Piece  | What it holds                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model  | A record type in one organization, with an immutable key.                                                                                                       |
| Field  | One property of a model: an immutable key (the JSON property name), a type, per-type settings, required flag, position. Every model has a required title field. |
| Record | The envelope (id, organization, slug, title, timestamps) in real columns, plus every field value in one JSONB `data` column keyed by field key.                 |

The split is a hybrid: anything every query touches (organization, title, timestamps) is an indexed column, and everything an admin invents is JSON. A baseline GIN index covers the JSON. An admin can ask for a faster plan on one field; the server then builds a Postgres expression index for that field in the background, without blocking writes.

There are 16 field types, from text and numbers through select, relation, file and document. One validator per type checks values on both the client and the server, so the form and the API reject the same input. The full list, with what each type accepts, is in the [data-models package README](../../packages/data-models/README.md).

Two types compute or embed rather than store plain values:

- **Formula** fields are read-only and computed when the record is saved. The expression engine is a small tokenizer, parser and evaluator (no `eval`) that runs on the server, which is authoritative, and in the browser for a live preview. A formula reads only its own record; there are no cross-record rollups.
- **Document** fields hold block-editor content as JSON. See [Block editor](block-editor.md).

When an admin creates a model, Monark registers three permissions (read, write, delete records of that model) and three event types (record created, updated, deleted) for it, grouped under the model's name. They're re-registered at every boot and appear in the roles screen and webhook picker like built-in ones.

## Following changes

People follow a single record or a whole model. On every record change, a subscriber sends an in-app notification to the union of both groups, minus the person who made the change, minus anyone who can't see that record. The visibility check uses the same rules as the record list, described in [Permissions](permissions.md).

## Queries: one tree, two editors, one compiler

Every filter on a record list is a query tree: leaves (`field`, operator, value) combined by `and` / `or` groups that can be negated. The tree is the canonical form. The filter menu and the text query bar are two editors over it, and the text bar's syntax is the tree in printed form; parsing and printing round-trip. What a user can type is listed in [Query syntax](../reference/query-syntax.md).

```
 filter menu ──┐
               ├─▶ query tree ──▶ compiler ──▶ SQL WHERE on the record table
 query bar  ───┘        ▲
 saved view ────────────┘ (stored tree)
 record scope ─────────── AND-ed in before compiling
```

The language itself is schema-agnostic and lives in `@monark/query`, which Kanban also uses. Each consumer maps its field types onto a small set of filterable kinds (text, number, boolean, date, select, ordered select, multi-select, relation, attachments), and the kind decides which operators are legal. Data models add the mapping from field type to kind: a formula filters as whatever its expression returns, and document fields aren't filterable. Kanban compiles the same tree to a typed Prisma query instead of SQL.

A few properties hold everywhere:

- Values travel as strings and are coerced per kind by the compiler. The wire schema caps a tree at 100 nodes and 8 levels deep, so a hostile query can't produce unbounded recursion or a huge `WHERE`.
- Variables resolve at compile time. `@me` and date anchors such as `@startOfWeek` are stored as tokens and replaced with the caller's id and the current UTC time when the query runs, so a saved view means the right thing for whoever opens it.
- A relation filter goes one level deep. `client.country:FR` compiles to an `EXISTS` over the linked model's records, with the caller's access to those records applied inside the subquery, so a filter can't reveal a related record the caller couldn't open. Traversal works only into other data models, and the caller needs read access to the target model.
- Text matching is case-insensitive, and date equality compares calendar days.

The compiler writes raw SQL rather than Prisma's JSON filters so it can use `ILIKE` and match the expression indexes exactly; see [Compile record queries to raw SQL](../decisions/0007-compile-record-queries-to-raw-sql.md). Field keys go into the SQL as identifiers, which is safe because they're validated once at creation and never change. Every value is a bound parameter.

The classic filter menu translates its choices into a tree and runs through the same compiler, so record-level access is applied in exactly one place.

## Saved views

A saved view is a named query tree on one model. It's personal by default; sharing makes it visible to everyone who can read the model, but only its creator can edit it. A view is checked against the query schema when saved. If it later names a field that was removed, it fails with an error when run rather than silently dropping the condition. See [Save a view](../use/data/save-a-view.md).

## Limits

- The query bar, boolean groups and saved views appear only where the `data-models.query-language` feature flag is on; elsewhere the record list shows the classic filter menu.
- Relation filters go one level deep, and only into data models.
- Formulas can't read other records.
- Results are ordered by last update, newest first; a query doesn't rank by relevance.

## Related

- [Query syntax](../reference/query-syntax.md)
- [Permissions](permissions.md): who can read which records
- [Find records](../use/data/find-records.md)
- [Compile record queries to raw SQL](../decisions/0007-compile-record-queries-to-raw-sql.md)
- [data-models package README](../../packages/data-models/README.md): data model, tRPC surface, public API
