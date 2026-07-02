# Extensibility Contract

What core guarantees to extended (non-core) modules, what extended modules guarantee to core, and the load-bearing rules either side must not break.

This document is the canonical reference for "can a new business-logic module ship without modifying core ?". The short answer is **yes** ; the long answer is below.

## Tier model

The repo has two tiers, locked by [tools/check-tiers.ts](../../tools/check-tiers.ts) and the [modules.manifest.ts](../../modules.manifest.ts) registry :

- **Core** modules (`@monark/auth`, `@monark/branding`, `@monark/feature-flags`, `@monark/notifications`, `@monark/organizations`, `@monark/rbac`, `@monark/users`, `@monark/webhooks`) ship with the platform. They may depend on each other and on `@monark/db` / `@monark/common`.
- **Extended** modules ship business logic on top. They may depend on any core module ; they may **not** depend on another extended module. The tier check fails CI if an extended module's `package.json` lists another extended package.

If a new module is fundamentally infrastructure (auth, billing, observability) it joins core. If it's a feature (posts, events, voting, contributions) it joins extended. The bar for entering core is high — every core module is loaded by every deploy, even ones that don't use that feature.

## What core guarantees to extended modules

Five extension points cover every common need. None of them require touching a core file ; each is a runtime API extended modules call once at api boot.

### 1. Feature flags

```ts
import { registerFlags } from "@monark/feature-flags/server";

registerFlags("posts", {
  "drafts-enabled": {
    description: "Allow saving posts as drafts before publishing.",
    defaultOn: true,
  },
});
```

- Identity is `(module, key)`. Two modules can declare the same key suffix — `posts.publish` and `events.publish` coexist because the DB unique key is the pair.
- Call sites use the dotted form : `isEnabled("posts.drafts-enabled", { userId, organizationId })`.
- Every override (org, role, user, global) flows through the same resolution path as core flags. The /admin/feature-flags surface picks up extended flags automatically.

### 2. Permissions

```ts
import { registerPermissions } from "@monark/rbac/server";

registerPermissions("posts", {
  publish: { description: "Publish a draft.", category: "posts" },
  moderate: { description: "Hide / unhide flagged posts.", category: "posts" },
});
```

- Identity is `(module, key)`. Same collision-free guarantees as flags.
- Call sites use the dotted form : `requirePermission(ctx, "posts.publish", orgId)`.
- Categories are loose strings — an extended module can introduce its own (e.g. `category: "posts"`). The /admin/rbac matrix groups every registered permission, in alphabetical order, regardless of who owns it.
- Built-in `ADMIN` (org-tier) and `SYSADMIN` (platform-tier) short-circuit `hasPermission` to true ; an extended module's permission is automatically granted to admins without any data backfill.

### 3. Notification kinds + templates

```ts
import { registerNotificationKind } from "@monark/notifications/server";

declare module "@monark/notifications/contracts" {
  interface NotificationDataRegistry {
    "posts.published": { postId: string; authorId: string; publishedAt: Date };
  }
}

registerNotificationKind(
  "posts.published",
  {
    category: "ACTIVITY",
    channels: ["IN_APP"],
    defaultEnabled: { IN_APP: true },
    requiredEmail: false,
    template: "posts/published",
  },
  {
    en: {
      subject: "Your post is live",
      html: "...",
      text: "...",
      inapp: { subject: "Live", body: "{{ postId }} is published" },
    },
    fr: {
      subject: "Votre publication est en ligne",
      html: "...",
      text: "...",
      inapp: { subject: "En ligne", body: "{{ postId }} est publié" },
    },
  },
);
```

- The `declare module` block keeps `notify("posts.published", { userId }, { postId, authorId, publishedAt })` typed at call sites.
- Templates can be inline strings (above) or imported from a `templates/<area>/<kind>.ts` file matching the core pattern.
- The same dispatch path runs every kind : prefs, locales, dedupe, soft-delete handling. Extended modules don't need to reimplement any of it.

### 4. Generic metadata sidecar

```ts
// On the server :
import { setUserMetadataValue } from "@monark/users/server";
import { setOrganizationMetadataValue } from "@monark/organizations/server";

// Set a per-user preference :
await setUserMetadataValue({ userId, module: "posts", key: "feed-density", value: "compact" });

// Or via tRPC :
trpc.users.metadata.set.mutate({ userId, module: "posts", key: "feed-density", value: "compact" });
```

- Identity is `(parent_id, module, key)` ; the value is JSON.
- Reads + writes via tRPC are gated by `users.read-metadata-for-module-<module>` / `users.write-metadata-for-module-<module>` (and the orgs equivalent). Extended modules register their own permission slugs alongside the metadata they read.
- The sidecar is the cheap path — no schema migration, no codegen, no FK plumbing. When an extended module needs **indexed columns** (filter by metadata value, sort by it, FK from another table), graduate to a per-module schema fragment ; that path is being built out as Phase-2 work and isn't required for shipping basic features today.

### 5. Domain events + webhooks

Any module that exports `XxxEvents` from its `/contracts/events.ts` and lands in [modules.manifest.ts](../../modules.manifest.ts) is included in the `DomainEvent` union by `pnpm gen:events`. Once the union is regenerated :

- Other subscribers can `on<MyEvent>("posts.published", handler)` against the in-memory bus.
- The wildcard subscriber in `@monark/webhooks` sees every emit and writes outbox rows for endpoints whose `WebhookSubscription` matches the type. No webhook code change required ; the moment your event lands in the manifest, operators can subscribe HTTP endpoints to it.

The bus is in-memory + best-effort. If durability matters (an audit log, an external integration), use webhooks as the persistence layer — the outbox table guarantees at-least-once delivery across process crashes.

### 6. Event-type registry (operator-facing metadata)

The compile-time `DomainEvent` union (extension point #5) is invisible to operators ; the **event-type registry** in `@monark/common` is its operator-facing twin. Each module registers a short description per event type at api boot, and the webhooks admin UI's subscription picker reads the merged list to render checkboxes :

```ts
// packages/posts/src/server/event-types.ts
import { registerEventTypes } from "@monark/common";

const POSTS_EVENT_TYPES = {
  "posts.published": {
    description: "A draft was published to readers.",
  },
  "posts.unpublished": {
    description: "An admin un-published a previously-live post (moderation).",
  },
} as const;

export function registerPostsEventTypes(): void {
  registerEventTypes("posts", POSTS_EVENT_TYPES);
}
```

Wire `registerPostsEventTypes()` into [services/api/src/server.ts](../../services/api/src/server.ts) alongside the other `register*EventTypes` calls. Operators creating webhooks then see `posts` as a collapsible group with both events listed by name + description, and can tick the group's tri-state header to subscribe to all of the module's events at once.

Modules that emit events but skip this registration still route through webhooks fine — but operators have to know the type strings to type them in. Always ship event-type registrations.

## What core does NOT guarantee

These are the boundaries an extended module must not cross. Crossing them means the module is doing something that should ship as a core change instead.

- **Extended modules MUST NOT modify the Prisma schema**, [packages/db/prisma/schema.prisma](../../packages/db/prisma/schema.prisma). The schema is a single core file owned by `@monark/db`. Extensions either use the metadata sidecar (option 4 above) or wait for the per-module-fragment story to land.
- **Extended modules MUST NOT depend on another extended module.** Use core packages, the event bus, or the metadata sidecar to compose features.
- **Extended modules MUST NOT mutate core registries directly** — only call the `register*` APIs. Reaching into `@monark/feature-flags/contracts` to mutate the in-memory map directly would crash boot ordering and bypass validation.
- **Extended modules MUST NOT rename or repurpose core domain events.** Add new event types under your module's prefix ; never reshape `auth.password-changed` for a different meaning.
- **Extended modules MUST NOT register flags / permissions / kinds under a core module's namespace.** Use your own module name as the namespace ; collisions are a deploy-time error.

## What extended modules guarantee to core

- **Idempotent registration.** Every `register<Module>*()` helper guards against double-registration so hot-reloads, test setups, and accidental double-imports don't crash.
- **Stable event payloads once shipped.** Once an extended module emits an event in production, treat the payload as a public API. Add fields ; don't rename or remove them. Subscribers (including webhook receivers) parse against the published shape.
- **Safe defaults.** A flag's `defaultOn` should be `false` for new behavior, `true` only for kill-switches over already-shipped behavior. A permission's category should match a category the /admin/rbac surface already renders, or introduce a new one consistently.
- **Module name = package name.** When an extended module is `@monark/posts`, register flags / permissions / kinds under module `posts`. Keeps the DB rows readable and the dotted-key form aligned with the package layout.

## Boot order

[services/api/src/server.ts](../../services/api/src/server.ts) is the canonical sequence :

1. Permission registrations, in alphabetical module order. (`registerWebhooksPermissions`, `registerOrganizationsPermissions`, …, `registerPostsPermissions`.)
2. Feature-flag registrations, same alphabetical order.
3. Notification-kind registrations (`registerCoreNotificationKinds()` + each extended module's helper).
4. Subscriber registrations (`registerNotificationSubscribers()` ; `registerWebhookSubscribers()` last so the outbox writer is the _last_ wildcard handler to fire).
5. `syncFlagsToDatabase()` upserts every registered flag's `FeatureFlag` row.
6. Worker starts (`startWebhookDeliveryWorker()`).
7. Express app comes up.

When adding an extended module to a deploy, drop its `register*` calls in the matching slots. The order between core and your module within each slot doesn't matter — registries are flat namespaces — but keeping things alphabetical makes the boot log readable.

## Test surface

Each of the five extension points has its own runtime-reset helper for tests :

- `_resetFlagRegistryForTesting()` from `@monark/feature-flags/contracts`
- `_resetPermissionRegistryForTesting()` from `@monark/rbac/contracts`
- `_resetNotificationRegistryForTesting()` from `@monark/notifications/contracts`
- `_resetHandlersForTesting()` from `@monark/common`
- `_resetWebhookSubscribersForTesting()` from `@monark/webhooks/server`

A test that exercises one extension point in isolation calls the matching reset in `beforeEach` + re-registers the slice it needs, so tests don't leak state across files. The integration suites that boot the full registry (e.g. the email-shell snapshot test) call `registerCore*()` once at module-eval and rely on idempotency.

## Phase-2 follow-ups

- **Per-module schema fragments.** A wrapper around `prisma generate` that concatenates per-module `prisma/<module>.prisma` files into the root schema before generation. Lets an extended module ship indexed columns + FK relations without modifying core.
- **Codegen for boot wiring.** A `pnpm gen:boot` script that scans the manifest and emits a `services/api/src/boot-registrations.generated.ts` file with every module's `register*()` calls. Removes the hand-maintained list in `services/api/src/server.ts`.
- **Persisted event bus.** The in-memory bus loses events on a process crash _between_ `emit()` and the wildcard subscriber's outbox write. Today the window is the same Prisma transaction so the source-mutation rollback covers it ; if subscribers ever go async-after-commit we'd want a real outbox at the bus level.
- **Receiver-side webhook verifier package.** A tiny `@monark/webhooks/verifier` that wraps the HMAC compare + timestamp tolerance for hand-rolled receivers.
