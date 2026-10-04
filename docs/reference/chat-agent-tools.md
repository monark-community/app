---
type: reference
---

# Assistant tools

Every tool the AI assistant can call, whether it writes, and the permission it needs. Tools run as the signed-in user, who also needs permission to use chat; a missing permission comes back to the assistant as an error, and the turn carries on. Writes stop for the user to **Confirm** or **Reject** before they run.

<!-- source: services/api/src/chat/tools.ts (buildChatToolset), services/api/src/public/routes.ts, services/api/src/chat/*-tools.ts -->

## Data Models

From the public API routes marked for MCP exposure, so external MCP clients get the same tools. A route tool writes when its HTTP method isn't `GET`. A record permission is met by the model-wide grant (`data-models.record-read`) or the per-model one (`data-models.<model>-record-read`); the same goes for write and delete.

| Tool                       | Writes | Permission                               | Does                                                                       |
| -------------------------- | ------ | ---------------------------------------- | -------------------------------------------------------------------------- |
| `monark_whoami`            | no     | none                                     | Returns the user id and organization the assistant acts in.                |
| `monark_list_models`       | no     | `data-models.read-schema`                | Lists the organization's data models.                                      |
| `monark_get_model`         | no     | `data-models.read-schema`                | Gets one model by key.                                                     |
| `monark_list_model_fields` | no     | `data-models.read-schema`                | Lists a model's fields.                                                    |
| `monark_list_records`      | no     | `data-models.read-schema` + record read  | Lists a model's records: `limit` up to 100, `cursor`, `search`.            |
| `monark_get_record`        | no     | record read                              | Gets one record by id. A record hidden from the user's roles is not found. |
| `monark_create_record`     | yes    | `data-models.read-schema` + record write | Creates a record in a model.                                               |
| `monark_update_record`     | yes    | record write                             | Changes a record's `slug` or `data`.                                       |
| `monark_delete_record`     | yes    | record delete                            | Deletes a record; `hard` deletes it permanently.                           |

## Automations

In-app only: not on the public API or MCP.

| Tool                             | Writes | Permission                                             | Does                                                                                        |
| -------------------------------- | ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `automation_list`                | no     | `automation.view`                                      | Lists automations (id, name, on or off, description, trigger); `search`, `limit` up to 100. |
| `automation_get`                 | no     | `automation.view`                                      | Gets one automation with its whole graph.                                                   |
| `automation_list_node_types`     | no     | `automation.view`                                      | Lists the node types a graph can use, with their config fields.                             |
| `automation_list_trigger_events` | no     | `automation.view`                                      | Lists the events an event trigger can fire on, with their payload fields.                   |
| `automation_create`              | yes    | `automation.view` + `automation.create`                | Creates an automation, turned off, from a whole graph. The graph is validated first.        |
| `automation_update`              | yes    | `automation.create` (+ `automation.view` with a graph) | Replaces the name, description or whole graph; a new graph is validated first.              |
| `automation_enable`              | yes    | `automation.manage`                                    | Turns an automation on or off.                                                              |
| `automation_test`                | yes    | `automation.run`                                       | Runs an automation now, real actions included, and returns a run id.                        |
| `automation_get_run`             | no     | `automation.view`                                      | Gets a run's status and per-step results.                                                   |

## Wiki

In-app only. The assistant reads page content but doesn't edit it.

| Tool               | Writes | Permission    | Does                                                                   |
| ------------------ | ------ | ------------- | ---------------------------------------------------------------------- |
| `wiki_list_pages`  | no     | `wiki.read`   | Lists every page as a tree (id, title, icon, parent).                  |
| `wiki_get_page`    | no     | `wiki.read`   | Gets one page with its content and breadcrumb.                         |
| `wiki_search`      | no     | `wiki.read`   | Searches page titles and content (at least 2 characters).              |
| `wiki_create_page` | yes    | `wiki.create` | Creates an empty page, at the top level or under a parent.             |
| `wiki_update_page` | yes    | `wiki.update` | Changes a page's title or icon.                                        |
| `wiki_move_page`   | yes    | `wiki.update` | Moves or reorders a page; a move that would create a cycle is refused. |
| `wiki_delete_page` | yes    | `wiki.delete` | Deletes a page and everything under it; recoverable.                   |

## Navigation

In-app only. Neither tool has a server effect.

| Tool                | Writes | Permission | Does                                                                                               |
| ------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------- |
| `list_destinations` | no     | none       | Lists the app's top-level sections and what each holds.                                            |
| `navigate`          | no     | none       | Shows the user a **Go to {label}** button for an in-app path; nothing happens until they click it. |

`navigate` accepts `/` and relative paths under `/calendar`, `/kanban`, `/data`, `/wiki`, `/automation`, `/admin` and `/account`. It refuses `//`, any scheme (`http:`, `javascript:`) and any other prefix. The target page checks permissions when it loads.

## Rules for every tool

| Rule                    | Behaviour                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Unknown tool name       | Treated as a write, so it can't run without the user's approval.                                        |
| Invalid input or denial | Comes back to the assistant as an error result; the turn doesn't fail.                                  |
| Rejected write          | Comes back as "The user declined to run this action."                                                   |
| Record of each call     | Input, status and result are stored on the conversation.                                                |
| Label in the thread     | Each tool's phrase under `chat.toolActions` in the web messages; unlisted tools show a generated label. |

How the tools are used: [How the AI assistant works](../concepts/chat-agent.md). To add one: [Give the assistant a new tool](../build/extend/add-an-assistant-tool.md).
