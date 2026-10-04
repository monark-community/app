---
type: how-to
---

# Emit a domain event

Announce a state change so other modules, automations and webhook subscribers can react without depending on your code. See [Architecture](../../concepts/architecture/_index.md) for how the event bus delivers events.

1. Declare the event in `src/contracts/events.ts` and add it to the module's union:
   ```ts
   import type { DomainEventBase } from "@monark/common/contracts/events";

   export type PostPublishedEvent = DomainEventBase & {
     type: "posts.post-published";
     postId: string;
     organizationId: string;
     actorId: string;
   };

   export type PostsEvents = PostPublishedEvent;
   ```
   Name it `<module>.<thing>-<past-tense>`. Include `organizationId` so webhooks reach the right organization, and ids rather than whole rows.
2. Regenerate the platform-wide event union:
   ```sh
   pnpm gen
   ```
3. Emit it from the procedure, after the change succeeds:
   ```ts
   await emit({ type: "posts.post-published", postId, organizationId: org.id, actorId, occurredAt: new Date() });
   ```
   `emit` comes from `@monark/common`.
4. Describe it for admins in `src/server/event-types.ts`, and call the helper in the event-types block of `services/api/src/server.ts`:
   ```ts
   registerEventTypes("posts", {
     "posts.post-published": {
       description: "A post was published.",
       fields: [{ key: "postId", type: "string", description: "The published post." }],
     },
   });
   ```
5. Start the api, open **Admin**, then **Webhooks**, and create an endpoint. Your event is listed in the picker under your module.

Good to know:

- Webhooks need nothing more: a registered event is subscribable at once. `fields` also tells automation authors what the event carries.
- The bus is in memory. For a guaranteed side effect, subscribe through webhooks or an automation, which persist deliveries.
- Once shipped, an event's payload is a public contract. Add fields; never rename or remove them.

Next: [Send a notification](send-a-notification.md)
