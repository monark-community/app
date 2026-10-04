---
type: how-to
---

# Limit a role to some records

Narrow what a role can read in one model to the records that match a query, such as only the deals in its region or only the records its members own. This is a record scope.

1. In **Admin**, open **Roles & permissions** and click the role. Scopes are available on a saved custom role, not on **Administrator**.
2. Under **Record scopes**, find the model. A model is listed only if the role can read its records.
3. Click **Limit…** and write a query, for example `region:eu` or `owner:@me`. The editor suggests fields and values; the full syntax is in [Query syntax](../../reference/query-syntax.md).
4. Click **Save scope**.

The model's row now shows your query instead of **All records**. Use **Edit** to change it, or **Remove limit** to let the role read every record again.

## Keep restricted records from schema designers

Someone who can design models doesn't automatically see records that were [restricted to certain roles](../../use/data/restrict-who-can-see-a-record.md). That takes a separate permission in the **Data models** group, described as seeing every Data Record and ignoring per-record restrictions. Leave it unticked on roles such as an HR schema designer. Administrators always have it.

Good to know:

- Roles add up. If someone also holds a role with no scope on that model, they still see everything that role allows.
- A scope can test only the model's own fields; it can't follow a relation to another model.

Next: [Manage a user's account](manage-a-users-account.md)
