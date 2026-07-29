import { registerNotificationKind } from "@monark/notifications/server";

// The generic automation message kind. The "Send Notification" node dispatches
// this with an arbitrary subject + body to a user, over both in-app and email
// (each opt-out-able per the recipient's prefs). It's the one notification kind
// automations use ; node config supplies the content, so the template just
// interpolates `{{ subject }}` / `{{ body }}`.
declare module "@monark/notifications/contracts" {
  interface NotificationDataRegistry {
    "automation.custom-message": { subject: string; body: string };
  }
}

let registered = false;

export function registerAutomationNotificationKinds(): void {
  if (registered) return;
  registered = true;

  registerNotificationKind(
    "automation.custom-message",
    {
      category: "ACTIVITY",
      channels: ["IN_APP", "EMAIL"],
      defaultEnabled: { IN_APP: true, EMAIL: true },
      requiredEmail: false,
      template: "automation/custom-message",
    },
    {
      en: {
        subject: "{{ subject }}",
        html: "<p>{{ body }}</p>",
        text: "{{ body }}",
        inapp: { subject: "{{ subject }}", body: "{{ body }}" },
      },
      fr: {
        subject: "{{ subject }}",
        html: "<p>{{ body }}</p>",
        text: "{{ body }}",
        inapp: { subject: "{{ subject }}", body: "{{ body }}" },
      },
    },
  );
}
