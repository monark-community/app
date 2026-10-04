---
type: reference
---

# Domain events

Every domain event registered at API boot, grouped by the module that emits it. These are the events webhooks can subscribe to and automations can trigger on. How events flow is in [The event bus](../concepts/architecture/event-bus.md).

<!-- source: registerEventTypes(...) calls in packages/*/src/server/event-types.ts; per-model types in packages/data-models/src/server/registrations.ts; union in packages/common/src/contracts/events.generated.ts -->

## Fields on every event

| Field                 | Type   | Meaning                                                                               |
| --------------------- | ------ | ------------------------------------------------------------------------------------- |
| `type`                | string | The event type, such as `kanban.card-moved`.                                          |
| `occurredAt`          | date   | When the event happened.                                                              |
| `correlationId`       | string | Optional. Ties events from one operation together.                                    |
| `subscriptionAliases` | list   | Optional. Extra types the event also matches when webhooks and achievements route it. |

The "Payload fields" column below lists each event's own fields, beyond these.

## Per-model record events

Each data model also gets three event types of its own, registered when the model is created and shown only to its organization. `<model>` is the model's key.

| Event                                | When it fires                       |
| ------------------------------------ | ----------------------------------- |
| `data-models.<model>-record-created` | A record was created in that model. |
| `data-models.<model>-record-updated` | A record in that model was updated. |
| `data-models.<model>-record-deleted` | A record in that model was deleted. |

They are aliases: the event emitted is the generic `data-models.record-created` (and so on), carrying the per-model type in `subscriptionAliases`.

## Emitted but not subscribable

The webhooks module emits these events on the bus, but they aren't registered, and the webhook subscriber skips every `webhook.*` event so that a delivery can never trigger more deliveries. Notification subscribers use the two delivery-failure events to alert admins.

| Event                                      | When it fires                                                   |
| ------------------------------------------ | --------------------------------------------------------------- |
| `webhook.delivery-failed`                  | A delivery attempt failed.                                      |
| `webhook.delivery-succeeded`               | A delivery was accepted by the receiver.                        |
| `webhook.endpoint-created`                 | A webhook endpoint was created.                                 |
| `webhook.endpoint-deleted`                 | A webhook endpoint was deleted.                                 |
| `webhook.endpoint-disabled-after-failures` | An endpoint was disabled automatically after repeated failures. |
| `webhook.endpoint-secret-rotated`          | An endpoint's signing secret was rotated.                       |
| `webhook.endpoint-updated`                 | A webhook endpoint was edited.                                  |

## Achievements

| Event                  | When it fires                                             | Payload fields                                                                      |
| ---------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `achievements.awarded` | A user earned an achievement (its threshold was crossed). | `organizationId`, `achievementId`, `achievementName`, `points`, `userId`, `actorId` |

## API keys

| Event                               | When it fires                                                         | Payload fields                                                     |
| ----------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `api-keys.key-created`              | A new API key was minted. The plaintext is never included.            | `organizationId`, `apiKeyId`, `ownerUserId`, `actorId`             |
| `api-keys.key-revoked`              | An API key was revoked and can no longer authenticate.                | `organizationId`, `apiKeyId`, `actorId`                            |
| `api-keys.service-account-created`  | A service account (org-owned machine principal) was created.          | `organizationId`, `serviceAccountId`, `name`, `roleIds`, `actorId` |
| `api-keys.service-account-disabled` | A service account was disabled ; its keys can no longer authenticate. | `organizationId`, `serviceAccountId`, `actorId`                    |

## Authentication

| Event                             | When it fires                                                                                                                                     | Payload fields                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `oauth.provider-linked`           | A social provider was connected to an existing account (from account settings, or by Supabase's own verified-email identity matching at sign-in). | `userId`, `provider`                                      |
| `oauth.provider-unlinked`         | A social provider was disconnected from an account. Security-relevant: it changes which credentials can reach the account.                        | `userId`, `provider`, `remainingProviders`, `hasPassword` |
| `totp.disabled`                   | TOTP was turned off (either by the user with their password, or by an admin reset).                                                               | `userId`, `triggeredBy`                                   |
| `totp.enabled`                    | The user confirmed TOTP enrollment. Their account now requires a second factor.                                                                   | `userId`                                                  |
| `totp.recovery-code-used`         | A recovery code was consumed (one-time, can never be re-used).                                                                                    | `userId`, `remainingCodes`                                |
| `totp.recovery-codes-regenerated` | The user regenerated their two-factor recovery codes ; the previous batch was invalidated.                                                        | `userId`, `count`                                         |
| `trusted-device.added`            | A new device was recognized + persisted on first sign-in from that device.                                                                        | `userId`, `deviceId`, `userAgent`, `country`              |
| `trusted-device.revoked`          | A specific trusted device's cookie was revoked.                                                                                                   | `userId`, `deviceId`, `scope`, `bulk`                     |
| `trusted-devices.all-revoked`     | Every trusted device for a user was revoked in a single sweep (e.g. password change).                                                             | `userId`, `count`, `scope`                                |
| `user.email-verified`             | The user clicked the confirmation link / entered the OTP and their email is now verified.                                                         | `userId`, `email`                                         |
| `user.password-changed`           | The user's password was rotated. Fires for both self-service and admin-initiated resets.                                                          | `userId`, `triggeredBy`                                   |
| `user.signed-in`                  | A user authenticated successfully. Fires every sign-in.                                                                                           | `userId`, `trustedDeviceId`                               |
| `user.signed-out`                 | A user explicitly signed out (their session was revoked).                                                                                         | `userId`, `scope`                                         |
| `user.signed-up`                  | A new account was created. Fires once per user, after the row is committed but before email verification.                                         | `userId`, `email`, `referralCode`, `provider`             |

## Automation

| Event                      | When it fires                                      | Payload fields                                                              |
| -------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| `automation.created`       | An automation flow was created.                    | `automationId`, `organizationId`, `name`, `actorId`                         |
| `automation.deleted`       | An automation flow was deleted.                    | `automationId`, `organizationId`, `actorId`                                 |
| `automation.run-failed`    | An automation run failed after exhausting retries. | `automationId`, `runId`, `organizationId`, `triggerEventType`, `error`      |
| `automation.run-started`   | An automation run began executing.                 | `automationId`, `runId`, `organizationId`, `triggerEventType`               |
| `automation.run-succeeded` | An automation run finished successfully.           | `automationId`, `runId`, `organizationId`, `triggerEventType`, `durationMs` |
| `automation.updated`       | An automation flow was edited.                     | `automationId`, `organizationId`, `actorId`                                 |

## Calendar

| Event                    | When it fires                                                  | Payload fields                                                                    |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `calendar.created`       | A calendar was created.                                        | `calendarId`, `organizationId`, `name`, `actorId`                                 |
| `calendar.deleted`       | A calendar was soft-deleted.                                   | `calendarId`, `organizationId`, `actorId`                                         |
| `calendar.event-created` | An event was added to a calendar.                              | `eventId`, `calendarId`, `organizationId`, `title`, `startAt`, `endAt`, `actorId` |
| `calendar.event-deleted` | An event was soft-deleted.                                     | `eventId`, `calendarId`, `organizationId`, `actorId`                              |
| `calendar.event-updated` | An event's details, schedule, or calendar changed.             | `eventId`, `calendarId`, `organizationId`, `changed`, `actorId`                   |
| `calendar.updated`       | A calendar's name, description, color, or role access changed. | `calendarId`, `organizationId`, `changed`, `actorId`                              |

## Chat

| Event                         | When it fires                                                                                          | Payload fields                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `chat.assistant-name-changed` | An admin renamed the organization's AI assistant (or cleared the override back to the deploy default). | `organizationId`, `assistantName`, `actorId`                             |
| `chat.conversation-created`   | A new conversation was created (an AI-assistant thread or a human conversation).                       | `organizationId`, `conversationId`, `kind`, `actorId`                    |
| `chat.message-created`        | A message was added to a conversation. The content is never included.                                  | `organizationId`, `conversationId`, `messageId`, `authorType`, `actorId` |

## Data models

| Event                              | When it fires                                                                                            | Payload fields                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `data-models.form-entry-published` | An admin approved a public-form submission onto the public board (now visible).                          | `dataModelId`, `dataModelKey`, `recordId`, `formId`, `organizationId`                           |
| `data-models.form-submitted`       | A record was submitted through a public form (anonymous link or email invite).                           | `dataModelId`, `dataModelKey`, `recordId`, `formId`, `mode`, `submitterEmail`, `organizationId` |
| `data-models.record-commented`     | A user posted a comment on a Data Record (discussions).                                                  | `dataModelId`, `dataModelKey`, `recordId`, `commentId`, `authorId`, `organizationId`            |
| `data-models.record-created`       | A new Data Record was created.                                                                           | `dataModelId`, `dataModelKey`, `recordId`, `organizationId`, `actorId`                          |
| `data-models.record-deleted`       | A Data Record was soft-deleted (`hard: false`) or hard-deleted (`hard: true`).                           | `dataModelId`, `dataModelKey`, `recordId`, `recordTitle`, `organizationId`, `actorId`, `hard`   |
| `data-models.record-scope-cleared` | A MonarkQL record scope was removed from a role, widening which of a model's records that role may read. | `dataModelId`, `dataModelKey`, `roleId`, `verb`, `actorId`, `organizationId`                    |
| `data-models.record-scope-set`     | A MonarkQL record scope was attached to a role, limiting which of a model's records that role may read.  | `dataModelId`, `dataModelKey`, `roleId`, `verb`, `actorId`, `organizationId`                    |
| `data-models.record-updated`       | A Data Record's fields, title, or slug changed.                                                          | `dataModelId`, `dataModelKey`, `recordId`, `organizationId`, `actorId`, `changed`               |
| `data-models.schema-changed`       | A Data Model or one of its fields was created, edited, reordered, or archived.                           | `dataModelId`, `organizationId`, `kind`, `actorId`                                              |

## Feature flags

| Event                  | When it fires                                                                                                                    | Payload fields                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `feature-flag.flipped` | An override was set or removed for a flag. The payload carries the new effective value + the scope (org / role / user / global). | `module`, `flagKey`, `scope`, `enabled`, `actorId` |

## Files

| Event                  | When it fires                                            | Payload fields                                                                        |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `files.bucket-created` | A storage bucket was created.                            | `bucket`, `isPublic`, `actorId`                                                       |
| `files.file-deleted`   | A file was deleted.                                      | `fileId`, `organizationId`, `bucket`, `key`, `actorId`                                |
| `files.file-uploaded`  | A file finished uploading (moved from pending to ready). | `fileId`, `organizationId`, `bucket`, `key`, `name`, `contentType`, `size`, `actorId` |

## GitHub

| Event                                  | When it fires                                                                | Payload fields                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `github.issue-commented`               | A comment was added to an issue or pull request.                             | `organizationId`, `repo`, `issueNumber`, `isPullRequest`, `commentBody`, `url`, `author`                |
| `github.issue-opened`                  | An issue was opened in a connected repository.                               | `organizationId`, `repo`, `issueNumber`, `title`, `body`, `url`, `author`                               |
| `github.pull-request-merged`           | A pull request was merged.                                                   | `organizationId`, `repo`, `prNumber`, `title`, `url`, `author`, `mergedBy`, `headRef`, `baseRef`        |
| `github.pull-request-opened`           | A pull request was opened.                                                   | `organizationId`, `repo`, `prNumber`, `title`, `body`, `url`, `author`, `headRef`, `baseRef`, `draft`   |
| `github.pull-request-review-submitted` | A review was submitted on a pull request (approved / changes requested / …). | `organizationId`, `repo`, `prNumber`, `state`, `reviewer`, `body`, `url`                                |
| `github.push`                          | Commits were pushed to a branch.                                             | `organizationId`, `repo`, `ref`, `branch`, `commitCount`, `headCommitId`, `headCommitMessage`, `pusher` |
| `github.release-published`             | A release was published.                                                     | `organizationId`, `repo`, `tag`, `name`, `body`, `url`, `prerelease`, `author`                          |

## Kanban

| Event                   | When it fires                                                                                                   | Payload fields                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `kanban.board-created`  | A new Kanban board was created.                                                                                 | `boardId`, `organizationId`, `name`, `actorId`                                                |
| `kanban.card-assigned`  | A card was assigned to a user (on creation with an assignee, or a reassignment to a new one).                   | `boardId`, `boardName`, `cardId`, `cardTitle`, `organizationId`, `assigneeId`, `assignedById` |
| `kanban.card-created`   | A card was created on a board.                                                                                  | `boardId`, `columnId`, `cardId`, `organizationId`, `title`, `assigneeIds`, `actorId`          |
| `kanban.card-deleted`   | A card was deleted.                                                                                             | `boardId`, `cardId`, `organizationId`, `actorId`                                              |
| `kanban.card-moved`     | A card moved to a different column or position. An in-column reorder fires this too (from and to column match). | `boardId`, `cardId`, `organizationId`, `fromColumnId`, `toColumnId`, `actorId`                |
| `kanban.card-updated`   | A card's title, description, assignee, or due date was edited.                                                  | `boardId`, `cardId`, `organizationId`, `changed`, `assigneeIds`, `actorId`                    |
| `kanban.column-created` | A column was added to a board.                                                                                  | `boardId`, `columnId`, `organizationId`, `name`, `actorId`                                    |

## Notifications

| Event                             | When it fires                                                                                                                         | Payload fields                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `notification.created`            | A notification row was persisted for a user (one event per delivered channel).                                                        | `userId`, `kind`, `category`, `channel`, `notificationId` |
| `notification.delivery-failed`    | An EMAIL or push delivery failed (SMTP error, rendering failure, transport unreachable). The IN_APP row, if any, was still persisted. | `userId`, `kind`, `channel`, `notificationId`, `reason`   |
| `notification.preference-changed` | The user toggled a (category, channel) preference row, or an admin reset their prefs.                                                 | `userId`, `kind`, `channel`, `enabled`                    |

## Organizations

| Event                          | When it fires                                                                                                                       | Payload fields                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `organization.created`         | A new organization was provisioned (bootstrap, admin form, or invite-driven).                                                       | `organizationId`, `actorId`                                           |
| `organization.invite-accepted` | An invitee completed signup (or signed in) and the membership + role were stamped.                                                  | `organizationId`, `inviteId`, `userId`                                |
| `organization.invite-sent`     | An admin invited an external email to join the organization at a specific role.                                                     | `organizationId`, `inviteId`, `email`, `roleId`, `roleKey`, `actorId` |
| `organization.member-joined`   | A user joined an organization (signup with invite, admin grant, or bootstrap singleton).                                            | `organizationId`, `userId`                                            |
| `organization.member-removed`  | A user was removed from an organization, either self-service or by an admin.                                                        | `organizationId`, `userId`, `actorId`                                 |
| `organization.updated`         | Profile fields changed on an organization (name, slug, logo, brand color). Slug rotations include the previous slug in the payload. | `organizationId`, `actorId`, `changed`, `previousSlug`                |

## Roles and permissions

| Event                | When it fires                                                                                                                                                      | Payload fields                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `rbac.role-assigned` | A role was granted to a user (UI grant, invite acceptance, or sysadmin CLI bootstrap). Skipped on idempotent re-grants where the user already had the role active. | `assignmentId`, `userId`, `organizationId`, `roleId`, `roleKey`, `grantedById`, `reason` |
| `rbac.role-created`  | An admin created a custom role inside their organization.                                                                                                          | `roleId`, `roleKey`, `organizationId`, `createdById`                                     |
| `rbac.role-deleted`  | A custom role was deleted. Only fires when no active assignments remain; the API hard-blocks deletion otherwise.                                                   | `roleId`, `organizationId`, `actorId`                                                    |
| `rbac.role-revoked`  | A role assignment was revoked, either by an admin or by a user leaving an org.                                                                                     | `assignmentId`, `userId`, `organizationId`, `roleId`, `roleKey`, `revokedById`, `reason` |
| `rbac.role-updated`  | A custom role's name / description / color / permission set was edited.                                                                                            | `roleId`, `organizationId`, `changed`, `actorId`                                         |

## Secrets

| Event             | When it fires                                                       | Payload fields                     |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------- |
| `secrets.created` | A new organization secret was created. The value is never included. | `organizationId`, `key`, `actorId` |
| `secrets.deleted` | An organization secret was deleted.                                 | `organizationId`, `key`, `actorId` |
| `secrets.updated` | An existing organization secret's value or description was updated. | `organizationId`, `key`, `actorId` |

## Telegram

| Event                       | When it fires                                                  | Payload fields                                                                                                    |
| --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `telegram.command`          | A /command was sent to the connected bot (e.g. /start, /help). | `organizationId`, `chatId`, `chatType`, `messageId`, `command`, `args`, `fromId`, `fromUsername`, `fromFirstName` |
| `telegram.message-received` | A (non-command) text message was sent to the connected bot.    | `organizationId`, `chatId`, `chatType`, `messageId`, `text`, `fromId`, `fromUsername`, `fromFirstName`            |

## Users

| Event                     | When it fires                                                                                                        | Payload fields                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `user.deleted`            | Hard-delete after the 14-day grace window. Personal data was anonymized + the row was removed from Supabase Auth.    | `userId`, `previousEmail`             |
| `user.deletion-canceled`  | A pending deletion was canceled before the grace window expired. The user can sign in again normally.                | `userId`                              |
| `user.deletion-requested` | A user (or admin) requested account deletion. The 14-day grace window starts ; the row's `deletedAt` is now stamped. | `userId`, `deletionCompletesAt`       |
| `user.email-changed`      | The user completed the two-side OTP confirmation flow ; their primary email is now the new value.                    | `userId`, `previousEmail`, `newEmail` |
| `user.profile-updated`    | Profile fields changed on a user (display name, avatar, banner, bio, locale).                                        | `userId`, `changed`                   |

## Wiki

| Event               | When it fires                                                    | Payload fields                                                      |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| `wiki.page-created` | A new wiki page was created.                                     | `pageId`, `organizationId`, `parentId`, `title`, `actorId`          |
| `wiki.page-deleted` | A wiki page was deleted, along with its whole subtree.           | `pageId`, `organizationId`, `pageIds`, `actorId`                    |
| `wiki.page-moved`   | A wiki page moved to a different parent or position in the tree. | `pageId`, `organizationId`, `fromParentId`, `toParentId`, `actorId` |
| `wiki.page-updated` | A wiki page's title, icon, or content was edited.                | `pageId`, `organizationId`, `changed`, `actorId`                    |
