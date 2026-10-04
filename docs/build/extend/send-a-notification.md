---
type: how-to
---

# Send a notification

Tell a person about something your module did, in the app and optionally by email, while respecting their notification preferences. Never send mail by hand.

1. Type the notification's data in `src/contracts/notifications.ts`:
   ```ts
   declare module "@monark/notifications/contracts" {
     interface NotificationDataRegistry {
       "posts.post-published": { postId: string; postTitle: string };
     }
   }
   export {};
   ```
2. Register the kind with English and French templates in `src/server/notification-kinds.ts`:
   ```ts
   registerNotificationKind(
     "posts.post-published",
     {
       category: "ACTIVITY",
       channels: ["IN_APP", "EMAIL"],
       defaultEnabled: { IN_APP: true, EMAIL: false },
       requiredEmail: false,
       template: "posts/post-published",
     },
     {
       en: { subject: "Published: {{ postTitle }}", html: "<p>…</p>", text: "…",
             inapp: { subject: "Published: {{ postTitle }}", body: "…", link: "/posts/{{ postId }}" } },
       fr: { /* same shape, in French */ },
     },
   );
   ```
   Call the helper in `services/api/src/server.ts`, in the notification-kinds block.
3. Send it from a subscriber to your [domain event](emit-a-domain-event.md), not from the procedure:
   ```ts
   import "../contracts/notifications";

   on<PostPublishedEvent>("posts.post-published", async (event) => {
     const post = await findPostById(event.postId);
     if (!post || post.authorId === event.actorId) return;
     await notify("posts.post-published", { userId: post.authorId }, { postId: post.id, postTitle: post.title });
   });
   ```
   Register the subscriber in the subscribers block, after the notification kinds and before the webhook subscriber.
4. Trigger the event as another user and open the notifications in the user menu. With email on, the message lands in the local mail catcher (`pnpm dev:tools:mail`).

Good to know:

- Don't notify people about their own actions.
- `notify` never throws; failures are recorded and logged, so the action that caused it is never rolled back.
- Set `requiredEmail: true` only for account-safety messages, which people can't turn off.

Next: [Put a feature behind a flag](put-a-feature-behind-a-flag.md)
