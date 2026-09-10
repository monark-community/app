# Access-control console ; one place to configure who sees what

> The authoring half of Phase A of the integration program. The engine shipped on `2026-09-08` ;
> the role-editor scope section shipped as PR #83.
>
> **One deliberate departure from the approved plan.** Plan section A.8 concluded that
> `record-access-section.tsx` **stays on the record**, reasoning that per-record sharing ("share this
> one page with Legal") is a genuinely different operation from authoring a role. The operator
> reversed that on 2026-09-10: _"Remove individual access configs on data models and such,
> everything related to access/permission is in the admin section."_ This spec follows the reversal
> and keeps a read-only summary on the object, which is the part of A.8's reasoning that survives
> ; see [Moving the existing editors](#moving-the-existing-editors).

## Context

The authorization _engine_ is finished. Three layers of record authorization shipped in the week of
`2026-09-08` and are documented in [record-scopes.md](../../technical-documentation/record-scopes.md):

| Layer          | Mechanism                                              | Status                              |
| -------------- | ------------------------------------------------------ | ----------------------------------- |
| Model          | `data-models.<key>-record-<verb>` / generic permission | shipped, editable in `/admin/rbac`  |
| Row (explicit) | `DataRecordRoleAccess`                                 | shipped, editable **on the record** |
| Scope (rule)   | `DataModelRoleScope` + MonarkQL                        | shipped, editable in `/admin/rbac`  |

Plus `data-models.view-all-records`, split out of `manage-schema` so row visibility became a
revocable capability, and `data-models.manage-record-scopes`, held separately so a data steward
cannot widen their own access.

What is not finished is **where an administrator goes to configure it**. Access authoring is
currently scattered across the surfaces the objects live on:

- **Record ACLs** ; `record-access-section.tsx` on a record's detail panel in `/data`.
- **Board access** ; the board dialog inside `kanban-shell.tsx`.
- **Calendar access** ; the role checkbox list inside `calendar-manage-dialog.tsx`, reached from
  four different calendar views.
- **Role scopes and permissions** ; `/admin/rbac`, which is the only one in the right place.

Three consequences. An admin cannot answer "what can this role see?" without visiting every
section. An admin cannot answer "who can see this?" at all, for anything. And the
[workspace unification](workspace-unification.md) program deletes `/kanban` outright (no redirect
shim), which takes the only editor for `KanbanBoardRoleAccess` with it. Calendar keeps its own
top-level entry, so `CalendarRoleAccess` keeps its editor either way ; that makes kanban the hard
deadline and calendar a consistency argument.

## Goals

- **All access authoring lives under `/admin`.** Objects keep a read-only "who can see this" hint
  with a link, never an editor.
- **Two directions, both answerable.** Role-centric ("what does the Support role see?") and
  object-centric ("who can see this database / board / calendar / record?").
- **Generic over resources, not per-module.** A registry, so a module contributes an
  access-controlled resource and gets admin UI without an admin screen of its own. Otherwise this
  track re-scatters the moment a sixth module ships a `XRoleAccess` table.
- **Answer "who holds permission X".** The long-standing
  [backlog item](../../todo/backlog.md#rbac-custom-roles--design-locked-ready-to-implement-shipped-2026-05-04),
  now cheap because the resolver exists.
- **Enforce `WRITE` and `DELETE` scope verbs**, which the schema already carries and the engine
  deliberately does not yet enforce.

## Non-goals

- **A new authorization model.** Nothing about how access resolves changes ; this is where it is
  authored, plus finishing two verbs the engine already reserved.
- **Per-user grants.** Access stays role-shaped. A per-user exception is a role with one member,
  and saying so is better than growing a second mechanism.
- **Sharing links / external access.** That is public forms and boards, which have their own
  trust model (token, never session).

## User stories

- **As an admin**, I open a role and see, in one screen, its permissions, its record scopes, and
  every object explicitly shared with it.
- **As an admin**, I open **Access → Objects**, pick a database, and see the roles that can read it,
  which of them are scoped, and which records carry their own ACL.
- **As an admin**, I search a permission key and get every role that grants it and every user who
  therefore holds it.
- **As an admin**, I revoke a role's access to a board from the admin section, without going to the
  board.
- **As a data steward with `manage-schema` but not `view-all-records`**, I can still shape a
  database and I cannot read its rows, and the console tells me plainly that this is why a list
  looks empty.

## The resource registry

Core `@monark/rbac` gains an extension point in the shape it already uses for search sources and
automation nodes:

```ts
registerAccessControlledResource("kanban.board", {
  label: "Boards",
  icon: "SquareKanban",
  // List the resources this admin may administer, paginated.
  list: (ctx, { limit, cursor }) => Paginated<{ id, label, icon? }>,
  // Which roles are explicitly granted this resource, and the write path.
  getRoleGrants: (ctx, resourceId) => string[],
  setRoleGrants: (ctx, resourceId, roleIds) => void,
  // The permission that bypasses the table entirely, shown as a caveat in the UI
  // ("plus anyone holding kanban.manage").
  bypassPermission: "kanban.manage",
  // Optional : a rule-based layer, if the resource has one.
  scopes: { verbs: ["READ"], get, set, clear },
});
```

`@monark/data-models` registers `data-models.model` (with scopes) and `data-models.record`;
`@monark/kanban` registers `kanban.board`; `@monark/calendar` registers `calendar.calendar`;
`@monark/wiki` registers nothing today (org-wide RBAC) and would register `wiki.page` if per-page
access is ever built. Registered at api boot in
[`services/api/src/server.ts`](../../../services/api/src/server.ts).

Every handler runs the module's own permission check. The console is a renderer over the registry;
it never reads another module's tables and holds no authorization logic of its own. That is what
keeps this from becoming the god-object that per-module screens were avoiding.

**After the workspace program lands, these registrations narrow rather than disappear.** Because the
locked decision is [materialize and write back](views-system.md) rather than a storage migration,
`KanbanBoard` and `Calendar` survive, and so do native (non-database-backed) boards and calendars
with their own role tables. What changes is that a **database-backed** board or calendar derives its
access from the source model, so its resource row renders read-only with a link to the model. The
registry is what lets that be a per-kind change rather than a rewrite of the console.

## The console

`/admin/access`, a new tab beside `/admin/rbac` (which stays, as the _definition_ of roles;
this is the _application_ of them). Three sub-tabs, all built from the shared list patterns
(`DataTable` + `TableDetailLayout` + `FilterBar`), like every other admin screen.

**Roles** ; a role, and everything that follows from it. Permissions (the existing tri-state
editor), record scopes (the shipped `role-scopes-section`), and a new **Shared with this role**
list fed by the registry: every resource, of every kind, explicitly granted. Read-only rows for
what the role gets by _bypass_, labelled with the bypassing permission, because "why can Support
see this board when it is not in the list" is the first question this screen will be asked.

**Objects** ; the mirror. Pick a resource kind, pick a resource, see its roles, its scopes, and a
count of records inside it carrying their own ACL, with a drill-in. Editing here writes through the
same registry handlers.

**Permissions** ; the audit. A permission key, and the roles granting it, and the users holding
those roles. Answers "who can delete records?" and, run the other way from a user, "why can this
person do that?", which is the question that actually gets asked during an incident.

Every screen states the caveat that ADMIN and SYSADMIN short-circuit `hasPermission`, since a
console that lists grants without saying so is actively misleading.

## Moving the existing editors

| Today                                                  | After                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `record-access-section.tsx` on the record detail panel | read-only summary ("Restricted to 2 roles") linking to the console ; editing requires the console |
| Board access inside `kanban-shell.tsx`                 | removed ; the board dialog keeps name / description / color                                       |
| Calendar access inside `calendar-manage-dialog.tsx`    | removed, same way ; note it is currently duplicated across day / week / month / agenda views      |

The read-only summary stays on the object deliberately. Hiding access state entirely from the thing
it applies to trades one problem (scattered authoring) for another (invisible restrictions), and
the summary costs one query the panel already makes.

## Finishing `WRITE` and `DELETE` scopes

`DataRecordScopeVerb` carries all three; `ENFORCED_SCOPE_VERBS` in
[`server/scopes.ts`](../../../packages/data-models/src/server/scopes.ts) admits only `READ`,
because a write must not move a record _out of_ the scope that authorized the write. Finishing it:

1. `update` and `create` re-evaluate the caller's WRITE scope against the **post-write** record,
   inside the same transaction, and roll back with a 403 if it no longer matches. ("You may edit
   your own deals" must not permit reassigning one away.)
2. `delete` evaluates the DELETE scope against the record as it stands, which needs no
   post-check.
3. Absent a WRITE scope, a READ scope keeps gating writes as it does today (you cannot edit what
   you cannot see), so this is purely additive.
4. The console exposes the verb tabs only once the engine enforces them ; offering a configurable
   no-op is the failure mode the original spec called out and avoided.

Integration tests mirror the shipped scope suite: narrowing, the additive OR across roles, the
post-write rollback, and the fail-closed parse.

## Dependencies

- Shipped: the three authorization layers, `QueryChipBar`, `role-scopes-section`, the admin list
  patterns.
- Independent of [workspace-unification.md](workspace-unification.md), but should land **before its
  C4**, which deletes `/kanban` with no redirect shim and takes the only `KanbanBoardRoleAccess`
  editor with it. Calendar keeps its own section, so its editor is a consistency argument rather
  than a deadline.

## Edge cases and risks

- **A console that lies.** Grants shown without their bypasses, or without ADMIN short-circuiting,
  is worse than no console. Every list renders effective access, with the source of each row.
- **Cost of the permissions audit.** "Who holds X" is a join per role over memberships. Paginate,
  and take the per-request `cache()` wrapping of `hasPermission` that the backlog already tracks,
  since this screen is the first to run many checks in one render.
- **Registry handlers are a new trust boundary.** A handler that forgets its own permission check
  hands an admin-shaped UI a way into another module's data. `check:modules` should assert every
  registered resource has an integration test proving a non-admin caller is refused.
- **Two access models for one board.** A native board is gated by `KanbanBoardRoleAccess` ; a
  database-backed board inherits the source model's permissions, row ACLs and record scopes. Both are
  correct, and a console that renders them identically would be lying. Show the binding explicitly
  ("access comes from _Projects_") rather than duplicating the model's rows onto the board.
- **Converting explicit shares into a rule.** A model with dozens of `DataRecordRoleAccess` rows
  usually means someone hand-shared what a single scope would express. Offering "convert 12 explicit
  shares into a rule" as a console action is the natural payoff of having both layers in one screen ;
  it must be an explicit, previewed action, never a silent rewrite.
- **Two admins editing the same role.** The scope section already saves immediately rather than
  joining a dirty form; keep that, and add a version check so the second save reports a conflict
  instead of overwriting.

## Success metrics

- Zero access editors outside `/admin`.
- "Who can see this record?" and "who holds this permission?" are both one screen.
- Adding an access-controlled resource is a `registerAccessControlledResource` call and no web
  change.
- WRITE and DELETE scopes enforced, with the post-write rollback covered by tests.

## Out of scope

- **Cross-org role templates** (existing backlog item ; single-tenant makes it low value now).
- **Time-bounded or conditional grants** ("Support sees this until Friday").
- **An access-change audit log UI.** The events already exist
  (`data-models.record-scope-{set,cleared}`) ; rendering their history is a separate feature that
  wants a general event-history surface, not a bespoke one.
