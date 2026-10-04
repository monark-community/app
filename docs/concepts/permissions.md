---
type: concept
---

# Permissions

Monark grants capabilities, not roles. Code asks "may this user do `<module>.<key>` in this organization?", and the answer comes from the roles the user holds and the permissions each role carries. Records in data models add three narrower layers on top: model, record and scope.

## Roles and permissions

Roles live in the database, not in code. A role belongs to one organization (or, for the platform tier, to none), carries a set of permissions, and is assigned to users; every assignment and revocation is recorded with who did it.

Two built-in roles short-circuit every check to "yes":

| Role                              | Tier         | Grants                                 | Assigned by                                         |
| --------------------------------- | ------------ | -------------------------------------- | --------------------------------------------------- |
| Administrator (`ADMIN`)           | organization | every permission in that organization  | an admin, from the app                              |
| System Administrator (`SYSADMIN`) | platform     | every permission in every organization | an operator, with a CLI script or SQL; never the UI |

Every other role is a custom role an admin builds under **Roles & permissions** in the admin area, picking permissions from a matrix.

Modules declare their permissions at boot (`registerPermissions`), each with a description and a category. A newly registered permission shows up in the matrix automatically and is already held by admins through the short-circuit, so adding one never needs a backfill. Permissions that are specific to one organization, such as the per-model record permissions a data model creates, stay registered globally but are shown only to the organization they belong to, so one organization's model names never appear in another's picker.

Write paths check a permission at the top of the server procedure. Comparing role names in code is not allowed; the [rbac package README](../../packages/rbac/README.md) has the API.

## Record access in data models

Reading a data-model record passes three layers, and all three must agree:

| Layer  | Question                                     | No rule means                      |
| ------ | -------------------------------------------- | ---------------------------------- |
| Model  | May you read this model's records at all?    | denied                             |
| Record | Is this record restricted to roles you lack? | open to everyone with model access |
| Scope  | Does the record match your role's condition? | unrestricted                       |

At the model layer, each model gets its own read, write and delete permissions when it's created. A generic version of each (any model) also exists; holding either is enough.

At the record layer, an admin can restrict one record to chosen roles, as in [Restrict who can see a record](../use/data/restrict-who-can-see-a-record.md). A record with no roles selected is open to everyone with model access.

At the scope layer, a role can be limited to "the records matching this query" on a model, written in the same [query syntax](../reference/query-syntax.md) as a filter: "support sees only tickets in its region", "a rep sees only their own deals" (`owner:@me`). Admins set scopes in a role's **Record scopes** section.

One permission, view all records, bypasses the record and scope layers. It is deliberately separate from managing a model's schema: designing a model and reading every row in it are different powers, so a data steward can hold the first without the second.

### How scopes combine

Roles only ever add access. For a given model, your effective scope is the OR of the scopes of every role you hold that grants read on it, where a granting role with no scope counts as "everything". So one unscoped granting role leaves you unrestricted, two scoped roles see the union of their scopes, and a role that doesn't grant read contributes nothing. Intersecting scopes instead would mean adding a grant could take access away. See [Make record scopes additive across roles](../decisions/0014-make-record-scopes-additive-across-roles.md).

### One enforcement path

The scope is AND-ed into the query tree before it is compiled, so it runs through the same compiler as every filter ([Data models and queries](data-models-and-queries.md)). A scope can't mean one thing in a list and another on a direct link:

| Path                               | How the scope applies                                  |
| ---------------------------------- | ------------------------------------------------------ |
| Record list                        | added to the compiled filter                           |
| Open, edit, delete, watch a record | the same compiler run against that one record          |
| Global search                      | each hit is checked, since search doesn't use the list |
| Change notifications               | checked per recipient                                  |
| Public API and MCP                 | inherited; both call the same procedures               |

A record hidden by any layer answers 404, never 403, so neither its existence nor the shape of the rule leaks.

### Failing closed

A filter that silently stops filtering is an authorization bug, so scopes fail closed:

- A stored scope that no longer parses denies everything rather than acting as "no scope".
- A scope can't follow a relation (`client.country:FR`); that would make the result depend on rows the role may not see.
- A scope that names an unknown field is rejected when saved. One that names a field archived or retyped later errors at query time instead of returning unfiltered rows.

Managing scopes is its own permission, separate from managing the schema, because whoever can delete a scope can widen their own access. Every set and clear emits an audit event carrying the model, role and actor, so webhooks can watch for it. The built-in Administrator role is left out of the scopes section, since it bypasses every scope anyway.

A scope adds one predicate to a query that already runs, against the same expression indexes, so a scoped list costs about what a filtered list costs. Scoping on an indexed field keeps it fast. Search and notification fan-out skip the per-user check entirely for models nobody has scoped.

## Limits

- Scopes limit reading only. Because you can't edit or delete a record you can't see, a read scope also guards writes, but there is no separate write or delete scope.
- Scopes can't traverse relations.
- System Administrator can't be granted from the UI.

## Related

- [Data models and queries](data-models-and-queries.md)
- [Query syntax](../reference/query-syntax.md)
- [Restrict who can see a record](../use/data/restrict-who-can-see-a-record.md)
- [Administer](../administer/_index.md): setting up roles for your organization
- [rbac package README](../../packages/rbac/README.md) and [data-models package README](../../packages/data-models/README.md)
