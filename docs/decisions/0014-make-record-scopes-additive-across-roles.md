---
type: decision
status: accepted
date: 2026-09-08
---

# 0014. Make record scopes additive across roles

## Context

A record scope limits a role to "the records matching this query" on one data model, such as "tickets in my region". A user often holds several roles for the same model, some scoped and some not. Something has to decide what that user sees. The rest of RBAC is additive: roles grant permissions and never take them away. Scopes are also an authorization control, so whatever rule is chosen has to be predictable to an admin and impossible to misread as wider access than intended.

## Options

| Option                                                                | For                                                                   | Against                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Intersect the scopes of all the user's roles                          | The narrowest result; one scope restricts everyone holding it         | Adding a scoped grant to a role can silently take access away from someone who also holds a broader role |
| Union per granting role; an unscoped granting role means "everything" | Matches how roles already behave; adding a grant never removes access | One broad role overrides every scope the user also holds                                                 |
| Let only one role apply (first or highest priority)                   | Simple to evaluate                                                    | Needs a role priority that doesn't exist; results depend on ordering                                     |

## Decision

A user's effective scope on a model is the OR of the scopes of every role they hold that grants read on it, where a granting role with no scope counts as unrestricted. A role that doesn't grant read contributes nothing. Only read is enforced: since a hidden record can't be edited or deleted, a read scope already guards writes.

The deciding reason: roles in Monark only add access, and intersecting would make "add a grant" sometimes mean "lose access".

## Consequences

- To restrict a user, every role that grants them the model must be scoped; one unscoped role leaves them unrestricted.
- Two scoped roles see the union of their scopes.
- The scope is AND-ed into the filter and compiled by the one query compiler, so lists, direct links, search and notifications agree.
- Scopes fail closed: one that no longer parses denies everything, and scopes can't follow relations.
- Managing scopes is a separate permission from managing the schema, since removing a scope widens access.
- Write and delete scopes, which need re-checking a record after the write, aren't built.
