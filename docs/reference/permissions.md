---
type: reference
---

# Permissions

<!-- source: the registerPermissions() calls in packages/*/src/server/permissions.ts, plus
packages/data-models/src/server/registrations.ts (per-model permissions) and
packages/rbac/src/server/rbac-permissions.ts. Group labels: admin.rbac.editor.categories in
services/web/src/messages/en.json. Regenerate by re-reading those calls. -->

Every permission a role can grant, by module, as listed in **Admin** > **Roles & permissions** > the role editor. "Group" is the heading the permission sits under there.

## Built-in roles

| Role                 | Grants                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator        | Every permission in the organization, including permissions added later. The only role that opens **Admin**.                                          |
| System administrator | Every permission in every organization on the instance. Granted outside the app; see [System administrator actions](system-administrator-actions.md). |

## achievements

| Permission            | Group        | Grants                                                                |
| --------------------- | ------------ | --------------------------------------------------------------------- |
| `achievements.manage` | achievements | Create and configure achievements and the conditions that award them. |
| `achievements.view`   | achievements | See the achievements gallery and your own badges.                     |

## api-keys

| Permission                         | Group    | Grants                                                                                                                         |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `api-keys.manage`                  | API keys | Create, list and revoke your own API keys. A key never does more than its owner can.                                           |
| `api-keys.manage-service-accounts` | API keys | Create and manage the organization's service accounts and their keys. A service-account key acts as the account, not a person. |

## automation

| Permission          | Group      | Grants                                                                                                     |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `automation.create` | Automation | Create and edit flows.                                                                                     |
| `automation.manage` | Automation | Turn flows on and off and delete them, including flows that use privileged steps (roles, user management). |
| `automation.run`    | Automation | Start a test run by hand.                                                                                  |
| `automation.view`   | Automation | See flows and their run history.                                                                           |

## calendar

| Permission        | Group    | Grants                                                             |
| ----------------- | -------- | ------------------------------------------------------------------ |
| `calendar.create` | Calendar | Create calendars.                                                  |
| `calendar.delete` | Calendar | Delete calendars. A personal calendar can't be deleted.            |
| `calendar.edit`   | Calendar | Change a calendar's name, description and color.                   |
| `calendar.manage` | Calendar | Everything above, plus deciding which roles can use each calendar. |
| `calendar.view`   | Calendar | See the calendars and events the role has access to.               |

## chat

| Permission    | Group | Grants                                                                                    |
| ------------- | ----- | ----------------------------------------------------------------------------------------- |
| `chat.manage` | chat  | Reserved for moderating every conversation in the organization. Not checked anywhere yet. |
| `chat.use`    | chat  | Use chat: see your own conversations and send messages, including to the AI assistant.    |

## data-models

| Permission                         | Group       | Grants                                                                                                                                    |
| ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `data-models.manage-forms`         | Data models | Create and manage public forms, approve board entries, and hide or delete board comments.                                                 |
| `data-models.manage-record-scopes` | Data models | Add or remove a record scope on a role. Kept apart from schema editing, because whoever can remove a scope can widen their own access.    |
| `data-models.manage-schema`        | Data models | Create, edit, reorder and archive models and their fields, and set up integrations such as the calendar.                                  |
| `data-models.read-schema`          | Data models | See model and field definitions. Needed, with `record-read`, to open **Data**.                                                            |
| `data-models.record-bulk-write`    | Data models | Edit many records at once. Needs `record-write` as well.                                                                                  |
| `data-models.record-delete`        | Data models | Delete records, in every model.                                                                                                           |
| `data-models.record-read`          | Data models | Read records, in every model.                                                                                                             |
| `data-models.record-write`         | Data models | Create and edit records, in every model.                                                                                                  |
| `data-models.view-all-records`     | Data models | See every record, ignoring per-record role restrictions. Leave it off for roles that design models but shouldn't read restricted records. |

### Per-model permissions

Each model adds three permissions, under a group named **Data Model:** followed by the model's name. `<key>` is the model's key, taken from its first name.

| Permission                        | Grants                                      |
| --------------------------------- | ------------------------------------------- |
| `data-models.<key>-record-delete` | Delete records in this model only.          |
| `data-models.<key>-record-read`   | Read records in this model only.            |
| `data-models.<key>-record-write`  | Create and edit records in this model only. |

## feature-flags

| Permission            | Group    | Grants                                      |
| --------------------- | -------- | ------------------------------------------- |
| `feature-flags.read`  | Platform | See feature flag definitions and overrides. |
| `feature-flags.write` | Platform | Set or remove feature flag overrides.       |

## files

| Permission             | Group | Grants                                                     |
| ---------------------- | ----- | ---------------------------------------------------------- |
| `files.delete`         | Files | Delete files.                                              |
| `files.manage-buckets` | Files | Create storage buckets and set their size and type limits. |
| `files.upload`         | Files | Upload files.                                              |
| `files.view`           | Files | List files and download them.                              |

## github

| Permission      | Group  | Grants                                                                                   |
| --------------- | ------ | ---------------------------------------------------------------------------------------- |
| `github.manage` | github | Connect GitHub for the organization: pick the token secret, generate the webhook secret. |

## kanban

| Permission      | Group  | Grants                                                                         |
| --------------- | ------ | ------------------------------------------------------------------------------ |
| `kanban.create` | Kanban | Create boards.                                                                 |
| `kanban.delete` | Kanban | Delete boards and cards.                                                       |
| `kanban.edit`   | Kanban | Edit boards, columns and cards: create, move and update cards, rename columns. |
| `kanban.manage` | Kanban | Everything above, plus deciding which roles can use each board.                |
| `kanban.view`   | Kanban | See the boards and cards the role has access to.                               |

## organizations

| Permission                      | Group        | Grants                                                                                       |
| ------------------------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `organizations.invite-member`   | Users        | Not checked anywhere yet. Inviting people requires the Administrator role.                   |
| `organizations.remove-member`   | Users        | Not checked anywhere yet. Removing people requires the Administrator role.                   |
| `organizations.update-settings` | Organization | Change the organization's assistant name. Its other settings require the Administrator role. |

## rbac

| Permission               | Group               | Grants                                                                                                                           |
| ------------------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `rbac.assign-admin-role` | Roles & permissions | Not checked anywhere yet. Giving or removing the Administrator role requires being an administrator.                             |
| `rbac.assign-role`       | Roles & permissions | Lets a flow use the automation step that gives or removes a role. In **Admin**, assigning roles requires the Administrator role. |
| `rbac.manage-roles`      | Roles & permissions | Not checked anywhere yet. Creating, editing and deleting roles requires the Administrator role.                                  |

## secrets

| Permission       | Group   | Grants                                                                      |
| ---------------- | ------- | --------------------------------------------------------------------------- |
| `secrets.manage` | Secrets | Create, change and delete secrets.                                          |
| `secrets.read`   | Secrets | See secret names and details. Values are never shown, under any permission. |

## telegram

| Permission        | Group    | Grants                                                                                 |
| ----------------- | -------- | -------------------------------------------------------------------------------------- |
| `telegram.manage` | telegram | Connect Telegram for the organization: store the bot token and register with Telegram. |

## twitter

| Permission       | Group   | Grants                                                     |
| ---------------- | ------- | ---------------------------------------------------------- |
| `twitter.manage` | twitter | Connect X for the organization: store its API credentials. |

## users

| Permission                                 | Group    | Grants                                                                  |
| ------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| `users.disable`                            | Users    | Lets a flow use the automation step that disables a user account.       |
| `users.manage-profile`                     | Users    | Lets a flow use the automation step that edits another user's profile.  |
| `users.read-metadata-for-module-calendar`  | Calendar | Not checked; each person's calendar view settings are always their own. |
| `users.write-metadata-for-module-calendar` | Calendar | Not checked; each person's calendar view settings are always their own. |

## webhooks

| Permission       | Group    | Grants                                                           |
| ---------------- | -------- | ---------------------------------------------------------------- |
| `webhooks.read`  | Platform | See webhook endpoints, their subscriptions and delivery history. |
| `webhooks.retry` | Platform | Retry a delivery by hand.                                        |
| `webhooks.write` | Platform | Create, edit and delete endpoints, and rotate their secrets.     |

## wiki

| Permission    | Group | Grants                                                       |
| ------------- | ----- | ------------------------------------------------------------ |
| `wiki.create` | wiki  | Create pages.                                                |
| `wiki.delete` | wiki  | Delete and restore pages, with everything nested under them. |
| `wiki.read`   | wiki  | Read pages.                                                  |
| `wiki.update` | wiki  | Edit pages and move them in the tree.                        |
