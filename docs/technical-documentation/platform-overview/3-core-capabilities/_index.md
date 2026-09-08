# 3. Core capabilities

## In this section

- **[3.1 User management (`@monark/users`)](31-user-management-monarkusers.md)**
- **[3.2 Authentication (`@monark/auth`)](32-authentication-monarkauth.md)**
- **[3.4 Role-based, granular permissions (`@monark/rbac`)](34-role-based-granular-permissions-monarkrbac.md)**
- **[3.5 Polymorphic Data Models (`@monark/data-models`)](35-polymorphic-data-models-monarkdata-models.md)**
- **[3.6 Monark Query Language ; MQL (`@monark/query`)](36-monark-query-language-mql-monarkquery.md)**
- **[3.8 Platform communications ; Notifications & email (`@monark/notifications`)](38-platform-communications-notifications-email-monarknotifications.md)**
- **[3.9 External integrations](39-external-integrations.md)**
- **[3.10 Automations ; node editor (`@monark/automation`)](310-automations-node-editor-monarkautomation.md)**
- **[3.11 Supporting core services](311-supporting-core-services.md)**

### 3.3 Organizations & tenancy (`@monark/organizations`)

Owns `Organization` (`slug` unique, `displayName`, `logoUrl`, `primaryColor`, soft delete), `OrganizationMembership` (soft-leave via `leftAt`), `Invite` (SHA-256 token hash, 14-day TTL, role pre-assignment), `OrgSlugRedirect` (90-day window on slug rotation), and an org metadata sidecar.

**Tenancy**: the app is single-tenant. Exactly one org is expected ; the api provisions it at boot from `INITIAL_ORG_*` env (or on demand via `pnpm provision:org`), and users are auto-granted membership on sign-up/sign-in (`ensureSingletonMembership`). There is no in-app setup wizard : provisioning is operator-driven, see [white-label.md](../../white-label/_index.md#provisioning-the-organization). Serving several businesses means running several instances, not one multi-tenant deploy — see [multi-instance.md](../../multi-instance/_index.md).

tRPC (`organizations.*`): `current`, `mine`, `bootstrapStatus`, `ensureBootstrap`, admin org CRUD-ish (`adminList`/`adminGet`/`adminUpdate`), and an `invites.*` sub-router. Events: `organization.created`/`updated`/`member-joined`/`invite-sent`/`invite-accepted`. Consumes `user.signed-up` / `user.signed-in`.

### 3.7 Central event bus (`@monark/common`)

In-process, in-memory, best-effort. `emit(event)` awaits type-matched handlers then wildcard handlers, each wrapped in try/catch so a subscriber failure is logged but never propagates to the emitter or stops the loop. `on(type | "*", handler)` subscribes. There is no persistence or retry at the bus level ; **durability is delegated to Webhooks** (its wildcard subscriber, registered last, writes an at-least-once outbox row).

- **`DomainEvent` union** is code-generated from every module's `contracts/events.ts` (`pnpm gen:events`). `DomainEventBase` carries `type`, `occurredAt`, optional `correlationId`, and `subscriptionAliases` (extra type strings an event also matches for webhook routing ; how per-model Data Model events route without minting union members).
- **Operator-facing event-type registry** (`registerEventTypes`) is the runtime twin of the union: it supplies the webhook subscription picker and the automation Event-Trigger node with each event's description + payload fields, with org-scoped visibility for per-model types.
