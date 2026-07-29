// Declaration-merge the Kanban notification payload into the notifications
// registry, so `notify("kanban.card.assigned", …)` is typed at the call site.
// This file is a side-effect import (no runtime exports) : the server activates
// it from `server/index.ts` and the notification subscriber. It is deliberately
// NOT re-exported from `contracts/index.ts`, so the client bundle never pulls
// the notifications types.

import "@monark/notifications/contracts";

declare module "@monark/notifications/contracts" {
  interface NotificationDataRegistry {
    "kanban.card.assigned": {
      cardId: string;
      cardTitle: string;
      boardId: string;
      boardName: string;
    };
  }
}
