---
type: reference
---

# Feature flags

Every flag registered at API boot, with its default. A flag is checked as `"<module>.<key>"`; how flags fit the module system is in [The extensibility contract](../concepts/architecture/extensibility-contract.md).

<!-- source: registerFlags(...) calls in packages/*/src/server/flags.ts and packages/*/src/server/feature-flags.ts -->

## Flags

| Flag                          | Default | Controls                                                                                                          | Dev script |
| ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| `achievements.enabled`        | off     | Achievements: the admin configuration, the award engine and worker, and the user gallery.                         |            |
| `auth.oauth`                  | on      | Social sign-in buttons and the OAuth callback. Which providers appear is set by the API's `AUTH_OAUTH_PROVIDERS`. |            |
| `auth.totp-onboarding-prompt` | on      | Offering two-factor enrolment once a user's email is verified.                                                    |            |
| `auth.totp-required-admin`    | on      | Requiring admins to enrol in two-factor within 7 days of first sign-in.                                           |            |
| `auth.totp-trust-devices`     | on      | Letting a device that passed two-factor skip the challenge on later sign-ins.                                     |            |
| `auth.trusted-devices`        | on      | Trusted-device tracking as a whole (cookie and stored device rows).                                               |            |
| `automation.enabled`          | on      | Automations: navigation entry, editor, trigger engine and run worker.                                             |            |
| `chat.ai-agent`               | off     | The AI assistant inside chat. Needs `chat.enabled`.                                                               | on         |
| `chat.enabled`                | off     | Chat: the conversations UI and message storage.                                                                   | on         |
| `chat.org-branding`           | off     | Letting the organization name its own assistant, overriding the deployment's `CHAT_ASSISTANT_NAME`.               |            |
| `data-models.public-forms`    | off     | Public forms: sharing a subset of a model's fields so people outside the app can submit records.                  | on         |
| `data-models.query-language`  | off     | The query bar and advanced filters on record lists. Off falls back to the basic filter menu.                      | on         |
| `discord.enabled`             | off     | The Discord integration's action nodes.                                                                           |            |
| `files.enabled`               | on      | The file-upload service and the **Files** admin page.                                                             |            |
| `github.enabled`              | off     | The GitHub integration: connecting a repository, its trigger events and nodes.                                    |            |
| `kanban.board`                | on      | Kanban as a whole. Off hides the route and its navigation entry.                                                  |            |
| `kanban.query`                | off     | The query bar on Kanban boards.                                                                                   |            |
| `public-api.enabled`          | off     | The REST API under `/api/v1` and its OpenAPI document. Off returns 404 for every route, even with a valid key.    | on         |
| `public-api.service-accounts` | off     | Service accounts and their API keys, under **Service accounts** in the admin area.                                | on         |
| `telegram.enabled`            | off     | The Telegram integration: connecting a bot, its trigger events and nodes.                                         |            |
| `twitter.enabled`             | off     | The X (Twitter) integration: connecting an account and its action nodes.                                          |            |
| `wiki.enabled`                | off     | The wiki. Off hides the route and its navigation entry.                                                           | on         |

"Dev script" marks the flags `pnpm enable:dev-flags` turns on, as global overrides, in a development database. It refuses to run in production.

## Resolution

A flag resolves to the first match, most specific first:

| Order | Source                                  |
| ----- | --------------------------------------- |
| 1     | an override for the user                |
| 2     | an override for one of the user's roles |
| 3     | an override for the organization        |
| 4     | a global override                       |
| 5     | the registered default                  |

A flag that was never registered resolves to off.

## Overrides

| Where                                                | Who                                             |
| ---------------------------------------------------- | ----------------------------------------------- |
| `featureFlags.setOverride` / `removeOverride` (tRPC) | users with the `feature-flags.write` permission |
| `pnpm enable:dev-flags`                              | developers, against a non-production database   |

No admin screen manages overrides. The developer overlay (Alt+D) shows, read-only, how each flag resolves for the current session.
