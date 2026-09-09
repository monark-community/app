# 3. Notification kinds + templates

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
