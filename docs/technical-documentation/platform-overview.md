# Monark Platform — System Overview (current state)

A single factual reference for what the Monark platform **is today**. It describes shipped behavior only ; per-feature deep-dives live in their own files under this directory and in each package's `README.md`. Where this doc and a module README disagree, this doc reflects the code as of writing.

Monark is a multi-tenant-capable business-application platform: a typed monorepo whose **core** ships a full substrate (identity, authorization, a runtime-defined polymorphic database, a query language, an event bus, communications, external integrations, and a visual automation engine), and whose **extended** modules add end-user apps (Calendar, Kanban) on top of that substrate without modifying it.

---

## 1. Tech stack

| Layer        | Choice                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language     | TypeScript 5.9 (ESM, full `strict` + `noUncheckedIndexedAccess`, `moduleResolution: Bundler`)                                                                    |
| Runtime      | Node ≥ 22                                                                                                                                                        |
| Monorepo     | pnpm 10 workspaces + Turborepo 2                                                                                                                                 |
| Frontend     | Next.js 15 (App Router, Turbopack) + React 19                                                                                                                    |
| Styling / UI | Tailwind CSS v4, Radix UI primitives, shadcn-style components, `class-variance-authority`, `lucide-react`, `next-themes`, `sonner`, `cmdk`                       |
| Client data  | tRPC v11 (`@trpc/react-query`) + TanStack Query v5 ; TanStack Table v8 ; `@dnd-kit` ; react-hook-form ; Tiptap (rich text) ; `@xyflow/react` (automation canvas) |
| Backend      | Express 5 + tRPC v11 (`@trpc/server/adapters/express`), `pino-http`                                                                                              |
| Database     | PostgreSQL via Prisma                                                                                                                                            |
| Auth         | Supabase Auth (session source of truth) + a shadow `User` table                                                                                                  |
| Validation   | zod at every boundary (tRPC input, request bodies, env)                                                                                                          |
| i18n         | next-intl, **en + fr** parity enforced by `pnpm check:i18n`                                                                                                      |
| Email        | nodemailer (SMTP)                                                                                                                                                |
| Storage      | Supabase Storage (via the Files module's swappable `FileStorage` interface)                                                                                      |
| Testing      | Vitest (+ Testcontainers integration), Playwright (+ axe), MSW                                                                                                   |

---

## 2. Architecture

### 2.1 Monorepo layout

Two workspace globs (`pnpm-workspace.yaml`): `services/*` and `packages/*`.

- **`services/`** — two thin runnable wiring layers with no business logic:
  - `services/web` — the Next.js frontend ; imports each module's `/client` + `/contracts`.
  - `services/api` — the Express + tRPC backend ; imports each module's `/server` + `/contracts`.
- **`packages/`** — the modules. Each exposes exactly three subpath exports and nothing else: **`/server`** (backend), **`/client`** (frontend), **`/contracts`** (shared types, zod, domain events). Workspace package boundaries _are_ the module boundaries.

Support libraries under `packages/` that are not tier-registered feature modules: `common` (event bus, logger, errors, tRPC + http + rate-limit helpers), `db` (Prisma), `query` (MQL), `components`, `shared`, `test-utils`.

### 2.2 Module tiers

Declared in `modules.manifest.ts`, enforced by `pnpm check:tiers`. **Core** modules ship with every deploy and may depend on each other + `@monark/db`/`@monark/common`. **Extended** modules add business features on top ; they may depend on core but **must not** depend on another extended module, edit core Prisma schema, mutate core registries directly, or rename/repurpose an existing event/flag/permission/notification kind.

| Module                  | Tier         | Purpose                                                 |
| ----------------------- | ------------ | ------------------------------------------------------- |
| `@monark/auth`          | core         | Supabase glue, TOTP, trusted devices, account lifecycle |
| `@monark/users`         | core         | The `User` entity + profile + metadata sidecar          |
| `@monark/organizations` | core         | Orgs, membership, invites, tenancy                      |
| `@monark/rbac`          | core         | Roles + granular permissions                            |
| `@monark/feature-flags` | core         | Runtime flag registration + resolution                  |
| `@monark/notifications` | core         | In-app + email dispatch                                 |
| `@monark/webhooks`      | core         | Outbound webhook outbox + delivery                      |
| `@monark/data-models`   | core         | Polymorphic, admin-defined record types                 |
| `@monark/automation`    | core         | Event-triggered node-graph flows                        |
| `@monark/secrets`       | core         | Per-org encrypted secret store                          |
| `@monark/api-keys`      | core         | API keys + service accounts                             |
| `@monark/public-api`    | core         | Curated REST `/api/v1` facade                           |
| `@monark/files`         | core         | Signed-upload file service                              |
| `@monark/branding`      | core         | Brand identity config                                   |
| `@monark/calendar`      | **extended** | Calendars, events, reminders, ICS                       |
| `@monark/kanban`        | **extended** | Boards, columns, cards                                  |

### 2.3 Extension points (how a feature ships without touching core)

Five runtime `register*` APIs, all wired at api boot: **feature flags** (`registerFlags`), **permissions** (`registerPermissions`), **notification kinds + templates** (`registerNotificationKind`), **domain events + the operator-facing event-type registry** (`registerEventTypes`), and the generic **metadata sidecar** (`setUserMetadataValue` / `setOrganizationMetadataValue`, identity `(parent_id, module, key)`, JSON value) for per-user/per-org data that needs no indexing. Data that needs indexed columns / FKs lives in the module's own Prisma fragment (extended modules own `packages/<module>/prisma/<module>.prisma`).

### 2.4 Codegen

`pnpm gen` = `gen:schema` (assembles `packages/db/prisma/schema.prisma` from `base.prisma` + per-extended-module fragments) + `gen:events` (builds the `DomainEvent` union from each module's `contracts/events.ts`) + `gen:routers` (composes the tRPC app router). Generated files are never hand-edited ; CI fails on drift. Additional gates: `pnpm check:tiers`, `pnpm check:modules`, `pnpm check:i18n`.

### 2.5 API boot sequence (`services/api/src/server.ts`)

Deterministic order: (1) feature-flag registrations → (2) permission registrations → (3) event-type registrations → (4) org-scoped visibility resolvers → (5) notification kinds → (6) built-in automation nodes → (7) calendar model-integration declaration → (8) subscriber registrations, with the **webhook wildcard subscriber registered last** so its outbox writer is the final handler. The Express app then mounts `GET /health`, the public REST API (`/api/v1`, before `/trpc`), cron endpoints (Bearer `CRON_SECRET`), the per-automation HTTP-trigger endpoint (`POST /hooks/automation/:id`), and `/trpc`. When run as the process entrypoint it also bootstraps the singleton org (single-tenant) and starts background workers: webhook delivery, automation, the calendar reminder sweep (60s), flag-to-DB sync, and data-model registration re-hydration.

### 2.6 Frontend shell

Mounted once in `app/(authed)/layout.tsx`: a persistent desktop **NavRail** (slim icon rail, `md+`) + a mobile hamburger `Sheet` drawer, both driven by the single `usePrimaryNav()` resolver (`config/primary-nav.ts` + flag filtering + an admin pin when `rbac.isAdmin`). A sticky `AppBar` carries breadcrumb + global search (⌘K), the notifications bell, and the user menu. Section-level secondary nav uses `SecondaryTabsBar` / `sidebar-rail`. Recurring list/detail screens compose from the app-local **patterns** library (`components/patterns`: `DataTable`, `FilterBar`, `TableDetailLayout` + `useDetailPanelRoute`, `DirtyFormBar`, `ConfirmDialog`, `ListMobileBar`, `CreateFab`, …). Schema-driven forms + table cells come from the **fields toolkit** (`components/fields`, a `FieldDef` registry the Data Models engine plugs into). Every meaningful async surface ships a layout-accurate `Skeleton`.

---

## 3. Core capabilities

### 3.1 User management (`@monark/users`)

Owns the `User` entity ; user ids are externally owned (Supabase Auth UUID for humans, `svc_`-prefixed for service accounts). `User` fields: `id`, `email` (unique), `emailVerifiedAt`, `displayName`, `avatarUrl`, `bannerUrl`, `bio`, `localePreference` (`en`/`fr`), `trustedDeviceTtlDays`, `deletedAt` (self-initiated grace delete), `disabledAt` (admin lockout), `kind` (`HUMAN` | `SERVICE`), `createdBy`. There is **no username/handle** ; public identity is `displayName` + `email`.

- **Read interface** (`server/read.ts`): `getById`, `getByIdOrThrow`, `getByEmail`, `getCurrent(ctx)` — the canonical "who is this user" surface every module uses.
- **Metadata sidecar**: `UserMetadata`, identity `(userId, module, key)`, JSON value ; the sanctioned way for any module to attach per-user data without a migration, gated by `users.{read,write}-metadata-for-module-<module>` permissions.
- **tRPC** (`users.*`): `me`, `updateProfile` (displayName/avatar/banner/bio/locale ; bio ≤ 400 code points), `updateTrustedDeviceTtl`, `syncEmail`, `requestAccountDeletion` / `cancelAccountDeletion` (14-day grace), a `metadata.*` sub-router, and admin procedures (`adminListUsers`, `adminGetUser`, `adminUpdateProfile`, `adminRequestDeletion`/`adminCancelDeletion`).
- **Events**: `user.profile-updated`, `user.email-changed`, `user.deletion-requested`, `user.deletion-canceled`.
- **UI**: the `/account/*` shell (`profile`, `security`, `notifications`, `api-keys`, `danger`) ; the reusable `UserBanner` hero (shared by `/account/profile` and `/admin/users/[id]`).

### 3.2 Authentication (`@monark/auth`)

Supabase Auth is the session source of truth ; the `User` table shadows `auth.users` 1:1 by UUID. The tRPC context reads the `Authorization: Bearer <token>`, verifies it with the Supabase admin client, and populates `{ userId, activeOrganizationId, requestId }` (active org flows from `user_metadata.active_organization_id`). The web client attaches the token via a single `httpBatchLink` and invalidates React Query on Supabase auth-state changes. Protected routes gate in `app/(authed)/layout.tsx` (bootstrap → session → trusted-device + `users.me` → deletion-grace lockdown).

- **Trusted devices** — cookie-identified (`monark_device_id`), only the SHA-256 hash stored ; per-device Supabase session revocation ; flag `auth.trusted-devices` (default on).
- **TOTP** — the app's own schema (not Supabase MFA) ; secrets AES-256-GCM at rest, recovery codes bcrypt-hashed ; two-step enrollment ; sign-in gate via a pending cookie + middleware redirect to `/signin/totp` ; flags `auth.totp-trust-devices`, `auth.totp-required-admin` (both default on).
- **tRPC** (`auth.*`): `session`, `signUp`, `checkPassword` (offline rules + HIBP k-anonymity, degrades open), `trustedDevices.*`, `totp.*`.

### 3.3 Organizations & tenancy (`@monark/organizations`)

Owns `Organization` (`slug` unique, `displayName`, `logoUrl`, `primaryColor`, soft delete), `OrganizationMembership` (soft-leave via `leftAt`), `Invite` (SHA-256 token hash, 14-day TTL, role pre-assignment), `OrgSlugRedirect` (90-day window on slug rotation), and an org metadata sidecar.

**Tenancy** is governed by the flag `tenancy.multi-tenant` (default **off**):

- **Single-tenant (default)**: exactly one org is expected ; boot provisions it from `INITIAL_ORG_*` env, routes gate to `/setup` until it exists, and users are auto-granted membership on sign-up/sign-in (`ensureSingletonMembership`).
- **Multi-tenant**: multiple orgs ; active org comes from the JWT claim.

tRPC (`organizations.*`): `current`, `mine`, `bootstrapStatus`, `ensureBootstrap`, admin org CRUD-ish (`adminList`/`adminGet`/`adminUpdate`), and an `invites.*` sub-router. Events: `organization.created`/`updated`/`member-joined`/`invite-sent`/`invite-accepted`. Consumes `user.signed-up` / `user.signed-in`.

### 3.4 Role-based, granular permissions (`@monark/rbac`)

Fully **table-driven** (no role enum): `Role` (`key`, `builtIn`, nullable `organizationId` — null = platform-wide), `RolePermission` (`(roleId, module, permission)`), `RoleAssignment` (`userId`, nullable `organizationId`, `roleId`, grant/revoke audit). Two reserved built-in roles short-circuit `hasPermission` to true: **`ADMIN`** (org-tier) and **`SYSADMIN`** (platform-tier, assignable only via `tools/sysadmin.ts` / SQL, never the UI ; auto-grants across every org).

- **Registration**: `registerPermissions(module, { key: { description, category, orgScoped? } })` at boot into an in-memory registry ; call sites use the dotted form `requirePermission(ctx, "<module>.<key>", orgId)`. New permissions auto-grant to admins (the short-circuit) and surface in `/admin/rbac` automatically.
- **Org-scoped visibility**: `registerOrgScopedPermissionVisibility` lets `orgScoped` permissions (e.g. per-Data-Model record permissions) stay globally registered while only showing an org the keys a resolver reports for it — so one org's model keys never leak into another's picker.
- **Write path**: `assignRole` / `revokeRole` (scope-enforced ; SYSADMIN not grantable via UI), custom-role CRUD ; events `rbac.role-assigned`/`-revoked`/`-created`/`-updated`/`-deleted`.
- **UI**: `/admin/rbac` (roles manager + permission matrix + read-only SYSADMIN roster).

The three built-in admin routers (users/organizations/rbac) currently gate their admin procedures via an ADMIN-tier short-circuit helper ; the named permissions they register are for server-to-server callers and appear in the matrix.

### 3.5 Polymorphic Data Models (`@monark/data-models`)

A Notion-Databases-style engine: admins define their own record types at runtime with no deploy. The legacy bespoke `Project` / `Industry` modules were migrated onto this engine and no longer exist. **This is the platform's general-purpose database layer.**

- **Models**: `DataModel` (org-scoped, immutable `key`), `DataField` (immutable `key` = the JSON property name, `type`, per-type `config`, `required`, `position`, `indexed`, `archivedAt`), `DataRecord` (denormalized `title` + `slug` + a single JSONB `data` blob), `DataRecordRoleAccess`, `DataRecordWatcher`, `DataModelWatcher`, `DataModelIntegration`, `DataFieldIndex`, `DataRecordView`.
- **Hybrid storage**: fixed indexed columns for the envelope (`id`, `organizationId`, `key`/`slug`, `title`, timestamps) + JSONB `data` namespaced by field key, with a baseline GIN index ; fast plans on hot fields are opt-in per field (`fields.requestIndex` provisions an expression index concurrently in the background).
- **Field types**: `TEXT, LONG_TEXT, RICH_TEXT, NUMBER, BOOLEAN, DATE, DATETIME, SELECT, MULTI_SELECT, RELATION, URL, EMAIL, FORMULA, FILE, ATTACHMENTS`. A single shared zod builder (`valueSchemaFor`) validates values on both client and server. Every model owns a reserved required `title` TEXT field.
- **FORMULA fields**: computed, read-only, compute-on-write ; a pure isomorphic expression engine (tokenizer → parser → evaluator, no `eval`) runs the same code server-side (authoritative) and client-side (live preview) ; same-record only (no cross-record rollups) ; result type inferred from the outermost operation.
- **Two-layer authorization**: model layer (per-model `data-models.<key>-record-{read,write,delete}` OR the generic `data-models.record-*` ; admins short-circuit) then row layer (`DataRecordRoleAccess` — a record with no rows is visible to all model-accessors ; restricted records 404 rather than 403 for unlisted callers).
- **Auto-integration**: on model create/rename, three per-model permissions + three per-model webhook event types are registered and grouped under `Data Model: <name>`, made org-visible via the visibility resolvers ; re-hydrated at boot (`hydrateDataModelRegistrations`).
- **Watchers (the subscribe primitive)**: `DataRecordWatcher` ("watch this page") and `DataModelWatcher` ("subscribe to the database"). On any `data-models.record-{created,updated,deleted}`, `record-watch-subscriber` fans out an in-app `data-models.record-changed` notification to `(record watchers ∪ model watchers)` minus the actor minus anyone the record's row-level access hides it from.
- **Module-integration slot registry**: `registerModelIntegration(module, { slots, description })` lets a module declare typed field "slots" an admin maps their own fields onto (`DataModelIntegration.slotMappings`) ; Calendar is the first consumer.
- **tRPC** (`dataModels.*`): `models.*`, `fields.*`, `integrations.*`, `records.*` (list with MQL filter, create/update/bulkUpdate/delete/restore, access + watch), `views.*`.
- **UI**: the admin schema builder (`/admin/data-models`) and the generic record list/detail browser (`/data/models/[modelKey]`), both built on the fields toolkit.

### 3.6 Monark Query Language — MQL (`@monark/query`)

A shared, schema-agnostic query package. Consumers map their own field types onto a `FilterableKind` and supply a per-field compiler ; used today by **Data Models** and **Kanban**.

- **AST**: `FilterNode` = predicate leaves (`{field, op, value}`) + boolean groups (`and`/`or`, negatable), with node-count (100) and depth (8) caps and a recursive zod wire schema.
- **Operators / kinds**: a taxonomy of ops (`is/contains/eq/gt/between/isAnyOf/hasAllOf/isEmpty/…`) legal per `FilterableKind` (`text, number, boolean, date, select, orderedSelect, multiSelect, relation, attachments`).
- **Text DSL**: `parseQuery` / `printQuery` round-trip a GitHub/Linear-flavored syntax (`status:open -assignee:present`, `priority:>=high`, `tags:&a,b`, `due:2026-01-01..2026-06-01`).
- **`@variables`**: `@me`, `@today`, `@startOfWeek`, … resolved at compile time against the caller + "now" (UTC).
- **Compilation**: Data Models compiles the tree to raw `Prisma.Sql` (case-insensitive `ILIKE`, hits the expression indexes, one-level relation traversal via `EXISTS`) ; Kanban compiles to a typed Prisma `where`. Field keys are interpolated as validated identifiers ; values are always bound parameters ; row-level access is preserved in the compiled path.
- **Saved views**: `DataRecordView` (personal or shared). Gated by flag `data-models.query-language` (default off).

### 3.7 Central event bus (`@monark/common`)

In-process, in-memory, best-effort. `emit(event)` awaits type-matched handlers then wildcard handlers, each wrapped in try/catch so a subscriber failure is logged but never propagates to the emitter or stops the loop. `on(type | "*", handler)` subscribes. There is no persistence or retry at the bus level ; **durability is delegated to Webhooks** (its wildcard subscriber, registered last, writes an at-least-once outbox row).

- **`DomainEvent` union** is code-generated from every module's `contracts/events.ts` (`pnpm gen:events`). `DomainEventBase` carries `type`, `occurredAt`, optional `correlationId`, and `subscriptionAliases` (extra type strings an event also matches for webhook routing — how per-model Data Model events route without minting union members).
- **Operator-facing event-type registry** (`registerEventTypes`) is the runtime twin of the union: it supplies the webhook subscription picker and the automation Event-Trigger node with each event's description + payload fields, with org-scoped visibility for per-model types.

### 3.8 Platform communications — Notifications & email (`@monark/notifications`)

Two channels: **`IN_APP`** and **`EMAIL`**. Categories: `SECURITY`, `ACCOUNT`, `ACTIVITY`, `DIGEST`.

- **Kinds registry**: `registerNotificationKind(kind, def, messages)` with typed payloads via `NotificationDataRegistry` declaration merging, so `notify(kind, {userId}, data)` stays typed at call sites. Each kind declares category, channels, per-channel `defaultEnabled`, `requiredEmail` (forces EMAIL on for account-safety kinds), and a template. Ships **14 core kinds** ; extended modules add their own at boot.
- **Dispatch** (`notify`, never throws): resolves the kind, loads the user (service accounts skipped entirely), picks locale from `localePreference`, computes a dedupe key, and per channel applies the preference gate + a 60s dedupe window, persists a `Notification` row, and for EMAIL renders + wraps in the brand shell and sends via nodemailer (no `SMTP_URL` in dev → logs "would have sent"). Emits `notification.created` per row ; `notification.delivery-failed` on email failure.
- **Preferences**: sparse per-`(userId, kind, channel)` rows ; `requiredEmail` kinds are force-enabled regardless. tRPC (`notifications.*`): `unreadCount`, `list` (infinite), `markRead`/`markUnread`/`markAllRead`/`dismiss`, `preferences.{get,set,reset}` (+ admin variants).
- **UI**: the AppBar bell + right-side drawer (unread badge polled every 15s, unread/all tabs) and the `/account/notifications` per-kind EMAIL preference grid.

### 3.9 External integrations

#### Webhooks (`@monark/webhooks`)

Outbound HTTP delivery of domain events with an at-least-once outbox.

- **Models**: `WebhookEndpoint` (org-scoped or platform-tier when `organizationId` null ; only the SHA-256 secret hash stored ; auto-disable after 5 consecutive failures), `WebhookSubscription` (exact or prefix match on event type), `WebhookDelivery` (outbox, unique idempotency key, backoff schedule), `WebhookDeliveryAttempt`.
- **Routing**: the wildcard subscriber (registered last, skips `webhook.*` to avoid recursion) matches `[event.type, ...subscriptionAliases]` against subscriptions and enqueues one delivery per matching endpoint — platform-tier endpoints always match, org endpoints match their org, user-tied events fan out to the user's member orgs.
- **Delivery**: a 5s worker (cron `/cron/sweep-webhook-deliveries` as fallback) POSTs with HMAC-SHA256 signature headers (`Webhook-Signature: v1=…`, timestamp, delivery id, idempotency key), 10s timeout, exponential backoff to a 5-attempt limit, then permanent failure + operator notification. Outbound URLs are SSRF-guarded (`assertOutboundUrlSafe`: https-only in prod).
- **tRPC** (`webhooks.*`): endpoint CRUD (`create` returns the plaintext secret once), `rotateSecret`, `listDeliveries`/`getDelivery`/`retryDelivery`, `listEventTypes` (org-visibility filtered). **UI**: `/admin/webhooks`.

#### Public API (`@monark/public-api`)

A curated **REST + OpenAPI** surface at `/api/v1`, mounted before `/trpc`. It has **no data model and no tRPC router of its own** ; it is a **facade** that authenticates an API key, synthesizes `{ userId, activeOrganizationId }`, and invokes the **same tRPC procedures** the web app uses via a caller factory — so RBAC, validation, and event emission are reused verbatim.

- **Auth**: `Authorization: Bearer <apiKey>` → the key's principal. Authority is the principal's RBAC (no parallel scope taxonomy) ; a key may additionally carry an optional per-key permission **ceiling** (see Access below). Each route chain is `apiKeyAuth → rateLimit → handler`, per-request flag-gated.
- **Access is org-scoped or user-scoped by principal kind**: a **user key** acts as its human creator ; a **service-account key** acts as an org-owned machine user with its own roles. The key is pinned to one organization. **Optional per-key ceiling**: a key with `fullAccess: false` is capped to a `permissions` allowlist (a subset of the owner's own RBAC permissions, checked in the mount before the caller runs) ; it only ever narrows the owner's live authority, never widens it, and even caps an admin owner. Least privilege = a limited-role principal, or a personal key restricted to a subset of your own permissions.
- **Routes today** map only to Data Models: `GET /me`, `GET /models`, `GET /models/:key`, `GET /models/:key/fields`, `GET|POST /models/:key/records`, `GET|PATCH|DELETE /records/:id`, plus `GET /openapi.json`.
- **Rate limiting**: per-key Postgres-backed token bucket (default refill 5/s, burst 20 ; `X-RateLimit-*` + `Retry-After`). **Versioning**: URL-prefixed `/api/v1`.
- **Flags**: `public-api.enabled` (default off, master kill switch), `public-api.service-accounts` (default off).

#### API keys & service accounts (`@monark/api-keys`)

- **`ApiKey`**: `organizationId`, `ownerUserId` (the principal), `tokenHash` (SHA-256, unique ; plaintext returned once), `prefix` (display), `fullAccess` + `permissions` (the optional ceiling allowlist), `expiresAt?`, `revokedAt?`. `mrk_`-prefixed. Authentication rejects revoked/expired keys and keys whose owner is disabled or deleted. Authority is the owner's RBAC ; `fullAccess: false` caps the key to its `permissions` subset (a ceiling, never a widening).
- **Service accounts**: reuse the core `User` with `kind = SERVICE` (`svc_`-prefixed, `@service.invalid` email), org membership, and their own role grants ; disabling one instantly kills its keys.
- **Permissions**: `api-keys.manage` (own keys), `api-keys.manage-service-accounts` (admin ; also flag-gated). **tRPC** (`apiKeys.*`): `list`/`create`/`revoke` + a `serviceAccounts.*` sub-router. **UI**: personal keys at `/account/api-keys`, service accounts at `/admin/service-accounts`.

### 3.10 Automations — node editor (`@monark/automation`)

A visual, event-driven flow engine. An admin builds a flow on a React Flow (`@xyflow/react`) canvas: one trigger node wired to action nodes ; when a matching event fires, the flow runs server-side, off the request path, durably.

- **Models**: `Automation` (`enabled` default false, `triggerEventType`, the whole `graph` as JSON, `scheduleNextRunAt`, runs act as `createdBy`), `AutomationRun` (durable outbox row: status, trigger payload, attempts/backoff, output), `AutomationRunStep` (per-node record with input/output/logs and `activeHandles` for durable-delay resume).
- **Triggers**: **event** (matches a real domain event via the wildcard subscriber, skipping `automation.*`), **manual** (`runNow`), **HTTP** (`POST /hooks/automation/:id` with a per-automation secret), **schedule** (interval/daily/weekly/monthly, UTC ; atomic claim via `scheduleNextRunAt`, cron `/cron/run-automation-schedules` as fallback).
- **Node registry**: `registerAutomationNodes(module, { key: node })` — any module contributes node types at boot ; each node pairs a serializable descriptor + zod config schema + a server-only `execute`. The execution context gives a node `organizationId`, `actorUserId`, upstream outputs, `log`, `activateOutputs` (branch gating), `suspend(ms)` (durable delay), and **`getSecret(name)`** (→ the Secrets module).
- **Engine**: topological execution with control-flow + data-dependency ordering ; config interpolation against `{ trigger, vars, steps.<slug>, <nodeId> }` ; per-node error branches ; durable suspend/resume rebuilt from persisted steps. A 5s worker drains the outbox with 3 attempts + backoff. Privileged nodes re-check the owner's permission at run time, so a run cannot escalate beyond its author.
- **Node types shipped**: triggers (event/manual/http/schedule) ; control flow (condition, constant, transform, set-variable, delay) ; communication (send-notification, webhook, send-email) ; data (create/update/delete/find record(s)) ; RBAC (assign/remove role) ; user (get, set-metadata, update-profile, set-active).
- **Events**: `automation.created`/`updated`/`deleted`/`run-started`/`run-succeeded`/`run-failed`. **Flag**: `automation.enabled` (default **on**). **UI**: `/automation` (list + React Flow editor with run history and per-node logs).

### 3.11 Supporting core services

- **Feature flags (`@monark/feature-flags`)** — `registerFlags(module, { key: { description, defaultOn } })` ; `isEnabled("<module>.<key>", { userId, organizationId, roleId })`. Resolution, most-specific first: user → role → org → global override → registered `defaultOn` ; an unregistered key resolves to `false`. Overrides surface in `/admin/feature-flags` ; a `FeatureFlag` DB row is synced per registration at boot.
- **Files (`@monark/files`)** — signed-upload service over Supabase Storage (the API never sees the bytes): `createUpload` (records a `PENDING` `StoredFile`, mints a one-shot signed URL) → browser uploads → `finalize` (flips to `READY`). Private buckets ; org-scoped `StoredFile` keyed `{organizationId}/{fileId}-{name}`. Consumed by Data Model `FILE`/`ATTACHMENTS` fields. Flag `files.enabled` (default on) ; **UI** `/admin/files`.
- **Secrets (`@monark/secrets`)** — per-org encrypted `key → value` store (AES-256-GCM, key separate from TOTP's). **Write-only over the wire**: plaintext never crosses tRPC and there is no read-value procedure ; plaintext is read server-side only via `getSecretValue(orgId, key)` on the trusted automation-node path (`ctx.getSecret`). **UI** `/admin/secrets` (names + metadata only).
- **Branding (`@monark/branding`)** — a typed brand-identity object (`appName`, `tagline`, `supportEmail`, `totpIssuer`, `fromEmail`, `appUrl`, `brandPrimary`, `brandAccent`, `logoSrc`), each overridable by env (`BRANDING_*` server + `NEXT_PUBLIC_BRANDING_*` client) ; the safe subset merges into every notification template.

---

## 4. Extensions (non-core modules)

### 4.1 Calendar (`@monark/calendar`)

Org-scoped named/colored calendars with per-role access.

- **Models** (own fragment): `Calendar` (`isPersonal` protected from deletion), `CalendarRoleAccess`, `CalendarEvent` (`eventType`: `STANDARD` | `PUNCTUAL` | `ALL_DAY` ; additive `sourceModule`/`sourceRecordId` unique pair for materialized events), `CalendarEventReminder`.
- **Views**: Day (hourly timeline), Week, Month, Agenda (all shipped ; mobile collapses Week/Month to Day). Drag-move/resize via Pointer Events. ICS import (capped 500) + export (`/calendar/export`).
- **Data Models materialization**: declares two integration slots (`time`, `calendarRef`) ; a subscriber on `data-models.record-*` upserts a `CalendarEvent` keyed on `(sourceModule, sourceRecordId)` — records that stop satisfying the mapping soft-delete their event, re-satisfying un-deletes. This is the first consumer of the model-integration slot registry.
- **Permissions**: `calendar.{view, create, edit, delete, manage}` (+ two metadata-sidecar perms for per-user view settings). **Notification kind**: `calendar.event.reminder` (IN_APP), fired by the 60s reminder sweep. **Feature flag**: none — Calendar is always on. **tRPC**: `calendar.calendars.*`, `calendar.events.*` (incl. `checkConflicts`, `search`, `import/exportIcs`), `calendar.settings.*`.

### 4.2 Kanban (`@monark/kanban`)

Boards, columns, and cards ; a board maps to a project/workflow, a column to a status, a card to a task.

- **Models** (own fragment): `KanbanBoard`, `KanbanBoardRoleAccess` (no rows = public to the org ; else granted roles ; `kanban.manage` bypasses), `KanbanColumn` (`position` in gaps of 10, advisory `wipLimit`), `KanbanCard` (`assigneeIds`/`reviewerIds` as member-id arrays, `dueAt`, `priority` `LOW|MEDIUM|HIGH|CRITICAL`, `estimate`, `subtasks` JSON, `position`).
- **Board view**: drag-and-drop via `@dnd-kit` (sortable columns + cards) ; card editor with rich-text description + subtasks ; WIP overage shown but not blocked.
- **MQL**: `cards.list` accepts an MQL filter tree compiled to a typed Prisma `where` (`compileKanbanFilter`) — fields `title/description/status/assignee/reviewer/priority(ordered)/due/estimate/created/updated`, with `@me`/`@today`. Gated by flag `kanban.query` (default off ; enforced in the web layer). Kanban does **not** integrate with Data Models.
- **Permissions**: `kanban.{view, create, edit, delete, manage}`. **Events**: `kanban.board-created`, `column-created`, `card-created`/`updated`/`moved`/`deleted`/`assigned`. **Notification kind**: `kanban.card.assigned` (IN_APP on, EMAIL off) via a subscriber on `kanban.card-assigned`. **Flags**: `kanban.board` (default on, kill switch) + `kanban.query` (default off). **tRPC**: `kanban.boards.*`, `columns.*`, `cards.*`, `members`.

---

## 5. Reference

### 5.1 tRPC app router (14 sub-routers)

`apiKeys, auth, automation, calendar, dataModels, featureFlags, files, kanban, notifications, organizations, rbac, secrets, users, webhooks`. The Public API is the separate REST `/api/v1` surface (not a tRPC router).

### 5.2 Feature flags (as-is defaults)

| Flag                          | Default | Effect                                   |
| ----------------------------- | ------- | ---------------------------------------- |
| `tenancy.multi-tenant`        | off     | Multiple orgs vs single-tenant singleton |
| `auth.trusted-devices`        | on      | Trusted-device recognition               |
| `auth.totp-trust-devices`     | on      | Trusted devices skip the TOTP challenge  |
| `auth.totp-required-admin`    | on      | Admins must enroll TOTP                  |
| `data-models.query-language`  | off     | MQL query bar + saved views              |
| `automation.enabled`          | on      | Automation nav/editor/engine/worker      |
| `files.enabled`               | on      | `/admin/files`                           |
| `public-api.enabled`          | off     | The `/api/v1` surface                    |
| `public-api.service-accounts` | off     | Service-account keys                     |
| `kanban.board`                | on      | Kanban section                           |
| `kanban.query`                | off     | Kanban MQL board query bar               |

### 5.3 Background workers & cron

Webhook delivery (5s + `/cron/sweep-webhook-deliveries`), automation (5s, incl. schedule fires + `/cron/run-automation-schedules`), calendar reminder sweep (60s + `/cron/send-calendar-reminders`), account-deletion processing (`/cron/process-account-deletions`), flag-to-DB sync (boot), Data Model registration re-hydration (boot). Cron endpoints authenticate with `Authorization: Bearer $CRON_SECRET`.

### 5.4 Where to read more

Per-module `README.md` files ; and under this directory: `architecture.md` (architecture + project structure), `data-model-queries.md` (MQL), `automation.md` + `automation-data-flow.md`, `kanban.md`, `secrets.md`, `files.md`, `webhook-secret-resolver.md`.
