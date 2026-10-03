---
type: reference
---

# Query syntax

What you can type in a query bar, in Data models and on Kanban boards. A query is a list of conditions written `field:value`; a record must match all of them.

## Conditions

| You write                    | Matches                                                                | Works on                        |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `status:open`                | the field equals the value (the usual match for the field's type)      | any field                       |
| `status:open,blocked`        | any of the listed values                                               | any field                       |
| `name:="Acme Inc"`           | exactly this text, ignoring case; quote any value that contains spaces | text                            |
| `priority:>3`                | greater than; also `>=`, `<`, `<=`                                     | numbers, dates (after / before) |
| `name:~acme`                 | contains                                                               | text                            |
| `name:!~test`                | doesn't contain                                                        | text                            |
| `name:^acme`                 | starts with                                                            | text                            |
| `name:$inc`                  | ends with                                                              | text                            |
| `tags:&urgent,customer`      | has all of the listed values                                           | multi-select                    |
| `due:2026-10-01..2026-10-31` | between, inclusive                                                     | numbers, dates                  |
| `assignee:empty`             | the field has no value                                                 | any field                       |
| `assignee:present`           | the field has a value                                                  | any field                       |
| `done:true` / `done:false`   | checked / unchecked                                                    | checkbox                        |
| `client.country:FR`          | a field of a linked record (one level)                                 | relation fields                 |

## Combining conditions

| You write                                      | Meaning                           |
| ---------------------------------------------- | --------------------------------- |
| `status:open priority:>3`                      | both (a space means AND)          |
| `status:open OR status:blocked`                | either                            |
| `(status:open OR status:blocked) assignee:@me` | group with parentheses            |
| `-assignee:present`                            | NOT: put `-` before any condition |
| `-status:done,cancelled`                       | none of the listed values         |

## Variables

Variables are filled in when the query runs, so a saved view stays correct for whoever opens it, whenever.

| Variable                            | Means                                      |
| ----------------------------------- | ------------------------------------------ |
| `@me`                               | you (use on people fields: `assignee:@me`) |
| `@now`                              | this moment                                |
| `@today`, `@yesterday`, `@tomorrow` | that day                                   |
| `@startOfWeek`, `@endOfWeek`        | this week's bounds                         |
| `@startOfMonth`, `@endOfMonth`      | this month's bounds                        |
| `@startOfYear`, `@endOfYear`        | this year's bounds                         |

Example: `due:@startOfWeek..@endOfWeek assignee:@me` lists what you have due this week. Dates are in UTC.

## Errors

An unknown field name, or a condition that doesn't suit the field's type (such as `>` on a text field), shows **Invalid query:** with the reason.
