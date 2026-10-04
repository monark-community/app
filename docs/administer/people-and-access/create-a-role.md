---
type: how-to
---

# Create a role

Make a role that grants exactly what a group of people needs, such as Support or Finance.

1. In **Admin**, open **Roles & permissions** and click **New role**.
2. Enter a **Name**. Optionally add a **Description**, shown in the role list, and a **Color** for the role's chip.
3. Under **Permissions**, tick what the role grants. Tick a group's header to grant everything in the group, or search to find a permission.
4. Click **Create role**.

Then give it to people from their user page; see [Change someone's roles](change-someones-roles.md). What each permission allows is listed in [Permissions](../../reference/permissions.md).

## Edit or delete a role

Click the role in the list, make your changes and click **Save**. To delete it, click **Delete role** under **Danger zone** and confirm. Everyone who held it loses it.

## The Administrator role

The built-in **Administrator** role always grants every permission, including ones added in later versions. You can change its name and description but not its permissions, and you can't delete it.

Good to know: creating a role fails if its name is Admin or Sysadmin, or if another role's name differs from it only in case, spaces or punctuation (such as "Sales team" and "sales-team"). Pick a more distinct name.

Next: [Limit a role to some records](limit-a-role-to-some-records.md)
