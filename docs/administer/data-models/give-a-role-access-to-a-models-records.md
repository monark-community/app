---
type: how-to
---

# Give a role access to a model's records

Who can read, add, change and delete records is set on roles. Administrators can do all of it.

1. In **Admin**, open **Roles & permissions** and click the role, or [create one](../people-and-access/create-a-role.md).
2. In the **Data models** group, tick the permissions to read Data Model and field definitions and to read Data Records. A role needs both to open **Data** at all, and they cover every model.
3. To let the role change records, choose one:
   - in the **Data models** group, tick create or edit, delete, and bulk edit for every model;
   - or, under **Data Model:** followed by the model's name, tick write and delete for that model only.
4. Click **Save**.

Each model gets its own **Data Model:** group the moment it's created.

To narrow which records a role can read inside a model, add a record scope; see [Limit a role to some records](../people-and-access/limit-a-role-to-some-records.md). To hide a single record, see [Restrict who can see a record](../../use/data/restrict-who-can-see-a-record.md).

Good to know: bulk edit needs the edit permission too. The full list is in [Permissions](../../reference/permissions.md).

Next: [Show a model's records on a calendar](show-a-models-records-on-a-calendar.md)
