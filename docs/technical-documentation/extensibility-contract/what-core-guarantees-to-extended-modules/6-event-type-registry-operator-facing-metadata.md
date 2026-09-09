# 6. Event-type registry (operator-facing metadata)

The compile-time `DomainEvent` union (extension point #5) is invisible to operators ; the **event-type registry** in `@monark/common` is its operator-facing twin. Each module registers a short description per event type at api boot, and the webhooks admin UI's subscription picker reads the merged list to render checkboxes :

```ts
// packages/posts/src/server/event-types.ts
import { registerEventTypes } from "@monark/common";

const POSTS_EVENT_TYPES = {
  "posts.published": {
    description: "A draft was published to readers.",
    // Optional: the event's payload fields (beyond the common base fields).
    fields: [
      { key: "postId", type: "string", description: "The post that was published." },
      { key: "authorId", type: "string", description: "The user who published it." },
    ],
  },
  "posts.unpublished": {
    description: "An admin un-published a previously-live post (moderation).",
  },
} as const;

export function registerPostsEventTypes(): void {
  registerEventTypes("posts", POSTS_EVENT_TYPES);
}
```

Wire `registerPostsEventTypes()` into [services/api/src/server.ts](../../../../services/api/src/server.ts) alongside the other `register*EventTypes` calls. Operators creating webhooks then see `posts` as a collapsible group with both events listed by name + description, and can tick the group's tri-state header to subscribe to all of the module's events at once.

Each entry may also declare a `fields` list (`{ key, type, description }`) naming the event's payload fields ; the specific "who / what" beyond the common base fields (`occurredAt`, `type`, exposed via `COMMON_EVENT_FIELDS`). This is metadata only (it does **not** validate the emitted payload), but it's what lets the **Automation** module's Event Trigger node advertise a flow's available `{{ trigger.* }}` outputs to authors. Declare `fields` for every event whose payload carries anything an automation would want ; `eventFieldsFor(type)` returns a type's declared fields merged with the common base. Keep field descriptions short and author-facing.

Modules that emit events but skip this registration still route through webhooks fine ; but operators have to know the type strings to type them in. Always ship event-type registrations.
