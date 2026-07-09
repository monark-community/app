import { registerNotificationKind } from "@monark/notifications/server";

let registered = false;

/**
 * The watcher notification kind. Fires when a watched record (or any record in
 * a watched model) is created / updated / deleted. IN_APP only + opt-out-able
 * (default on) — an email per record edit would be noise ; the bell feed is the
 * right surface. One kind covers all three change types via the `action` var
 * (the recipient-locale template can't branch on it, so the verb rides in the
 * data — same accepted limitation as calendar's `minutesLabel`).
 */
export function registerDataModelsNotificationKinds(): void {
  if (registered) return;
  registered = true;

  registerNotificationKind(
    "data-models.record-changed",
    {
      category: "ACTIVITY",
      channels: ["IN_APP"],
      defaultEnabled: { IN_APP: true },
      requiredEmail: false,
      template: "data-models/record-changed",
    },
    {
      en: {
        subject: "{{ recordTitle }}",
        html: "",
        text: "",
        inapp: {
          subject: "{{ recordTitle }}",
          body: "{{ modelName }} · {{ action }} by {{ actorName }}",
          link: "{{ link }}",
        },
      },
      fr: {
        subject: "{{ recordTitle }}",
        html: "",
        text: "",
        inapp: {
          subject: "{{ recordTitle }}",
          body: "{{ modelName }} · {{ action }} par {{ actorName }}",
          link: "{{ link }}",
        },
      },
    },
  );
}
