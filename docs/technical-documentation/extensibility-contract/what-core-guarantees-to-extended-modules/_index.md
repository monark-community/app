# What core guarantees to extended modules

Five extension points cover every common need. None of them require touching a core file ; each is a runtime API extended modules call once at api boot.

## In this section

- **[3. Notification kinds + templates](3-notification-kinds-templates.md)**
- **[6. Event-type registry (operator-facing metadata)](6-event-type-registry-operator-facing-metadata.md)**

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

- Identity is `(module, key)`. Two modules can declare the same key suffix ; `posts.publish` and `events.publish` coexist because the DB unique key is the pair.
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
- Categories are loose strings ; an extended module can introduce its own (e.g. `category: "posts"`). The /admin/rbac matrix groups every registered permission, in alphabetical order, regardless of who owns it.
- Built-in `ADMIN` (org-tier) and `SYSADMIN` (platform-tier) short-circuit `hasPermission` to true ; an extended module's permission is automatically granted to admins without any data backfill.


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
- The sidecar is the cheap path ; no schema migration, no codegen, no FK plumbing. When an extended module needs **indexed columns** (filter by metadata value, sort by it, FK from another table), graduate to a per-module schema fragment (`packages/<module>/prisma/<module>.prisma`, assembled into the schema by `pnpm gen:schema`) : the mechanism the extended `calendar` and `kanban` modules already use for their own tables.


### 5. Domain events + webhooks

Any module that exports `XxxEvents` from its `/contracts/events.ts` and lands in [modules.manifest.ts](../../../../modules.manifest.ts) is included in the `DomainEvent` union by `pnpm gen:events`. Once the union is regenerated :

- Other subscribers can `on<MyEvent>("posts.published", handler)` against the in-memory bus.
- The wildcard subscriber in `@monark/webhooks` sees every emit and writes outbox rows for endpoints whose `WebhookSubscription` matches the type. No webhook code change required ; the moment your event lands in the manifest, operators can subscribe HTTP endpoints to it.

The bus is in-memory + best-effort. If durability matters (an audit log, an external integration), use webhooks as the persistence layer ; the outbox table guarantees at-least-once delivery across process crashes.
