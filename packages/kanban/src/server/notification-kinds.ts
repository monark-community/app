import { registerNotificationKind } from "@monark/notifications/server";

let registered = false;

// Notifies the assignee when a card is assigned to them. In-app by default ;
// email is available but opt-in (defaultEnabled EMAIL: false) since a task
// assignment is routine activity, not account-safety.
export function registerKanbanNotificationKinds(): void {
  if (registered) return;
  registered = true;

  registerNotificationKind(
    "kanban.card.assigned",
    {
      category: "ACTIVITY",
      channels: ["IN_APP", "EMAIL"],
      defaultEnabled: { IN_APP: true, EMAIL: false },
      requiredEmail: false,
      template: "kanban/card-assigned",
    },
    {
      en: {
        subject: "You were assigned: {{ cardTitle }}",
        html: '<p>You were assigned to <strong>{{ cardTitle }}</strong> on the <strong>{{ boardName }}</strong> board.</p><p><a href="/kanban?board={{ boardId }}">Open the board</a></p>',
        text: "You were assigned to {{ cardTitle }} on the {{ boardName }} board. Open it: /kanban?board={{ boardId }}",
        inapp: {
          subject: "You were assigned: {{ cardTitle }}",
          body: "On the {{ boardName }} board",
          link: "/kanban?board={{ boardId }}",
        },
      },
      fr: {
        subject: "Une carte vous a été assignée : {{ cardTitle }}",
        html: '<p>La carte <strong>{{ cardTitle }}</strong> vous a été assignée sur le tableau <strong>{{ boardName }}</strong>.</p><p><a href="/kanban?board={{ boardId }}">Ouvrir le tableau</a></p>',
        text: "La carte {{ cardTitle }} vous a été assignée sur le tableau {{ boardName }}. Ouvrir : /kanban?board={{ boardId }}",
        inapp: {
          subject: "Une carte vous a été assignée : {{ cardTitle }}",
          body: "Sur le tableau {{ boardName }}",
          link: "/kanban?board={{ boardId }}",
        },
      },
    },
  );
}
