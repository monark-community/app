---
type: reference
---

# Automation nodes

Every node you can add to a flow in the automation editor, grouped as the **Add node** picker groups them. Fields marked \* are required. Outputs are what later steps can reference as `{{ steps.<reference name>.<output> }}` (or `{{ trigger.<field> }}` for the trigger).

<!-- source: registerAutomationNodes(...) in packages/automation/src/server/nodes/index.ts, packages/{github,telegram,discord,twitter}/src/server/nodes/index.ts, packages/wiki/src/server/nodes.ts -->

## Every node

| Setting          | Where                                   | What it does                                                                                                                                      |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Error output** | **Advanced**, on any node but a trigger | Adds an **On error** output that runs when the node fails, so the flow continues instead of stopping. The failing node then also outputs `error`. |
| Reference name   | right-click the node, **Rename**        | The `<reference name>` in `{{ steps.<reference name>.… }}`.                                                                                       |

## Trigger

A flow has exactly one trigger. A new flow starts with an **Event Trigger**; right-click it and choose **Replace** to switch to another.

| Node               | Starts the flow when                                         | Fields                                                                                                                                                                              | Outputs (`{{ trigger.… }}`)                                                                           |
| ------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Event Trigger**  | a chosen event happens in your organization                  | **When this event fires**\*: an event from the grouped list                                                                                                                         | the event's fields (listed under **Outputs**), plus `type`, `organizationId`, `actorId`, `occurredAt` |
| **Data Record**    | a record in one model is created, updated or deleted         | **Data model**\*; **On**\*: **Record created**, **Record updated** or **Record deleted**                                                                                            | the record event's fields, plus the common event fields                                               |
| **Manual Trigger** | you click **Run now**; never on its own                      | none                                                                                                                                                                                | the common event fields                                                                               |
| **HTTP Trigger**   | another system sends a `POST` to the flow's **Endpoint URL** | none; the node shows the **Endpoint URL** and a **Secret** (**Generate secret**), sent as an `Authorization: Bearer` header                                                         | `body`: the request body                                                                              |
| **Schedule**       | the schedule comes round                                     | **Schedule**\*: **On an interval** (every 1 to 10,080 minutes), **Daily**, **Weekly**, **Monthly (by date)** or **Monthly (by weekday)**, at a time you enter in your own time zone | `firedAt`, `scheduledFor`                                                                             |

The events available to **Event Trigger** are listed in [Domain events](events.md). Connected GitHub repositories and Telegram bots add their own events there.

## Control

| Node             | Does                                                                                                                          | Fields                                                                                                                                                                                            | Outputs                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Condition**    | Runs only the **True** or the **False** branch                                                                                | **Value**\*; **Operator**\*: equals, does not equal, contains, greater than, less than, greater or equal, less or equal, is truthy, is empty; **Compare to** (ignored for is truthy and is empty) | `result`                                                     |
| **Constant**     | Outputs a fixed value; has no input and runs when a later node uses its value                                                 | **Type**\*: Text, Number, Boolean or JSON; **Value**\*                                                                                                                                            | `value`                                                      |
| **Transform**    | Computes a value with a formula (the same formulas as formula fields); has no input and runs when a later node uses its value | **Expression**\*, for example `{{ trigger.count }} * 2`. Put quotes round text you insert: `CONCAT("Hi ", "{{ trigger.name }}")`                                                                  | `value`                                                      |
| **Set Variable** | Stores a value as `{{ vars.<name> }}` for every later step, including after a **Delay**                                       | **Variable name**\*; **Value**: text or a reference (its type is kept)                                                                                                                            | `name`, `value`                                              |
| **Delay**        | Pauses the run, then continues                                                                                                | **Delay (seconds)**\*: 1 to 86,400 (24 hours)                                                                                                                                                     | `delayedSeconds`                                             |
| **For Each**     | Runs the steps on its **Each item** output once per item in a list, then continues on **Done**                                | **List**\*: a reference to a list, such as `{{ steps.find_records.records }}`                                                                                                                     | `item`, `index` (from 0), `count`; after the loop, `results` |

**For Each** handles up to 1,000 items. Its loop steps can't include a **Delay** or another **For Each**.

## Communication

| Node                  | Does                                                               | Fields                                                                                                                                    | Outputs                        |
| --------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Send Notification** | Sends an in-app notification, and an email if the person allows it | **Recipient**\* (a user); **Subject**\*; **Message**\*                                                                                    | `recipientUserId`, `delivered` |
| **Send Email**        | Sends a plain email to any address                                 | **To**\*; **Subject**\*; **Body**\*                                                                                                       | `to`, `sent`                   |
| **Webhook**           | Sends an HTTP request; a response other than 2xx fails the step    | **URL**\*; **Method**: GET, POST (default), PUT, PATCH, DELETE; **Body (JSON)**, sent for POST, PUT and PATCH. Times out after 10 seconds | `status`, `ok`                 |

## Data

These act as the flow's owner and need the owner to have the matching record permission. They only reach records the owner can see.

| Node              | Does                                      | Fields                                                                                                                                                            | Outputs                          |
| ----------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Create Record** | Adds a record to a model                  | **Model**\*; **Data (JSON)**\*: values keyed by field key, such as `{"title": "{{ trigger.name }}"}`                                                              | `recordId`                       |
| **Update Record** | Changes the fields you list on one record | **Record id**\*; **Patch (JSON)**\*                                                                                                                               | `recordId`                       |
| **Delete Record** | Deletes a record                          | **Record id**\*; **Hard delete**: remove it permanently instead of moving it to deleted records                                                                   | `recordId`, `deleted`, `hard`    |
| **Find Record**   | Fetches one record                        | **Record id**\*                                                                                                                                                   | `id`, `title`, `slug`, `data`    |
| **Find Records**  | Lists records where one field matches     | **Model**\*; **Field key**\*; **Match**\*: contains (text), equals (exact), equals (number), equals (boolean); **Value**\*; **Max results**: 1 to 100, default 10 | `count` (all matches), `records` |

## Rbac

Shown as **Rbac** in the picker. Both need the owner to be allowed to assign roles.

| Node            | Does                                           | Fields                                       | Outputs                         |
| --------------- | ---------------------------------------------- | -------------------------------------------- | ------------------------------- |
| **Assign Role** | Gives a person a role                          | **User**\*; **Role key**\*, such as `editor` | `assignmentId`, `alreadyActive` |
| **Remove Role** | Takes a role away; fails if they don't hold it | **User**\*; **Role key**\*                   | `revoked`, `roleKey`            |

## User

Every node here works only on members of your organization.

| Node                             | Does                                                                 | Fields                                                          | Outputs                      |
| -------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------- |
| **Get User**                     | Looks a person up                                                    | **Look up by**\*: User id or Email; **Value**\*                 | `id`, `email`, `displayName` |
| **Set User Metadata**            | Stores a value against a person for a module                         | **User**\*; **Module**\*; **Key**\*; **Value (JSON or text)**\* | `ok`                         |
| **Update User Profile**          | Changes display name, bio or language; blank fields stay as they are | **User**\*; **Display name**; **Bio**; **Locale (en / fr)**     | `id`, `displayName`          |
| **Deactivate / Reactivate User** | Blocks or restores a person's sign-in                                | **User**\*; **Action**\*: Deactivate or Reactivate              | `userId`, `disabled`         |

## Wiki

Each needs the flow owner's matching wiki permission (create, edit or delete pages).

| Node                  | Does                                 | Fields                                                                                                           | Outputs                  |
| --------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Wiki: Create page** | Creates a page                       | **Title**\*; **Parent page id** (blank for top level); **Icon (emoji)**; **Body**: each line becomes a paragraph | `pageId`, `title`        |
| **Wiki: Update page** | Changes a page                       | **Page id**\*; **New title**; **New icon (emoji)**; **New body** (replaces the body)                             | `pageId`                 |
| **Wiki: Delete page** | Deletes a page and all its sub-pages | **Page id**\*                                                                                                    | `pageId`, `deletedCount` |

## Github

Shown as **Github** in the picker. Every node has **Token secret**\*: a secret holding a GitHub token with access to the repository. All but search also have **Repository**\*, written `owner/name`.

| Node                            | Does                                 | Other fields                                                                        | Outputs                                                                     |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **GitHub: Create issue**        | Opens an issue                       | **Title**\*; **Body**; **Labels** (comma-separated)                                 | `issueNumber`, `url`, `id`                                                  |
| **GitHub: Get issue**           | Fetches an issue                     | **Issue number**\*                                                                  | `number`, `title`, `body`, `state`, `url`, `author`                         |
| **GitHub: List issues**         | Lists a repository's issues          | **State**: Open, Closed or All; **Labels**; **Max results** (default 30, up to 100) | `count`, `issues`                                                           |
| **GitHub: Comment on issue/PR** | Adds a comment                       | **Issue / PR number**\*; **Comment**\*                                              | `commentId`, `url`                                                          |
| **GitHub: Add labels**          | Adds labels                          | **Issue / PR number**\*; **Labels**\* (comma-separated)                             | `labelCount`                                                                |
| **GitHub: Set issue state**     | Closes or reopens an issue           | **Issue number**\*; **State**\*: Closed or Open                                     | `number`, `state`                                                           |
| **GitHub: Create pull request** | Opens a pull request                 | **Title**\*; **Head branch**\*; **Base branch**\*; **Body**; **Draft**              | `prNumber`, `url`, `id`                                                     |
| **GitHub: Get pull request**    | Fetches a pull request               | **PR number**\*                                                                     | `number`, `title`, `state`, `merged`, `url`, `headRef`, `baseRef`, `author` |
| **GitHub: Request review**      | Requests reviewers                   | **PR number**\*; **Reviewers**\* (comma-separated GitHub logins)                    | `requested`                                                                 |
| **GitHub: List commits**        | Lists recent commits                 | **Branch / SHA** (default branch if blank); **Max results**                         | `count`, `commits`                                                          |
| **GitHub: Search issues/PRs**   | Searches with GitHub's search syntax | **Query**\*, such as `repo:octo/hello is:issue is:open label:bug`; **Max results**  | `count`, `total`, `items`                                                   |

## Telegram

Uses the bot your admin connected for the organization. Every node has **Chat ID**\*: a numeric chat id or `@channelusername`.

| Node                         | Does                                        | Other fields                                                               | Outputs                           |
| ---------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- |
| **Telegram: Send message**   | Sends a text message                        | **Message**\*; **Format**: Plain text, Markdown or HTML; **Send silently** | `messageId`, `chatId`             |
| **Telegram: Edit message**   | Replaces the text of a message the bot sent | **Message ID**\*; **New text**\*; **Format**                               | `messageId`                       |
| **Telegram: Delete message** | Deletes a message                           | **Message ID**\*                                                           | `ok`                              |
| **Telegram: Send photo**     | Sends a photo from a URL                    | **Photo URL**\*; **Caption**; **Format**                                   | `messageId`, `chatId`             |
| **Telegram: Get chat**       | Fetches a chat's details                    | none                                                                       | `id`, `type`, `title`, `username` |

## Discord

Most nodes have **Bot token secret**\* (a secret holding a bot token; the bot must have access to the channel) and **Channel ID**\*.

| Node                          | Does                                           | Other fields                                                                                  | Outputs                       |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| **Discord: Send message**     | Posts a message with the bot                   | **Message**\*                                                                                 | `messageId`, `channelId`      |
| **Discord: Send via webhook** | Posts through a channel webhook, no bot needed | only **Webhook URL secret**\* (no bot token or channel); **Message**\*; **Override username** | `sent`                        |
| **Discord: Edit message**     | Edits a message the bot sent                   | **Message ID**\*; **New content**\*                                                           | `messageId`                   |
| **Discord: Add reaction**     | Reacts to a message                            | **Message ID**\*; **Emoji**\*: a unicode emoji or a custom one as `name:id`                   | `ok`                          |
| **Discord: List messages**    | Reads recent messages                          | **Max results** (default 20)                                                                  | `count`, `messages`           |
| **Discord: Get channel**      | Fetches a channel's details                    | none                                                                                          | `id`, `name`, `type`, `topic` |

## Twitter

Shown as **Twitter** in the picker. Uses the X account your admin connected for the organization.

| Node                  | Does                             | Fields                                                    | Outputs           |
| --------------------- | -------------------------------- | --------------------------------------------------------- | ----------------- |
| **X: Post tweet**     | Posts from the connected account | **Text**\*: up to 280 characters, or your account's limit | `tweetId`, `text` |
| **X: Reply to tweet** | Replies to a post                | **In reply to tweet ID**\*; **Text**\*                    | `tweetId`         |
| **X: Delete tweet**   | Deletes a post the account owns  | **Tweet ID**\*                                            | `deleted`         |

Related: [Build a flow](../use/automations/build-a-flow.md), [How automations run](../concepts/automations.md).
