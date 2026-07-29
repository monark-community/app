// Activates the "kanban.card.assigned" notification-kind augmentation for this
// compilation unit (so `notify(...)` below is typed).
import "../contracts/notifications";
import { logger, on } from "@monark/common";
import { notify } from "@monark/notifications/server";
import type { KanbanCardAssignedEvent } from "../contracts/events";

let registered = false;

/**
 * Notifies the assignee when a card is assigned to them. Prefers the
 * emit-event-then-subscribe pattern (over an inline `notify()` in the router)
 * so the notification stays decoupled from the mutation path. Self-assignment
 * is skipped — you don't need to be told you assigned a card to yourself.
 */
export function registerKanbanNotificationSubscriber(): void {
  if (registered) return;
  registered = true;

  on<KanbanCardAssignedEvent>("kanban.card-assigned", async (event) => {
    if (event.assigneeId === event.assignedById) return;
    try {
      await notify(
        "kanban.card.assigned",
        { userId: event.assigneeId },
        {
          cardId: event.cardId,
          cardTitle: event.cardTitle,
          boardId: event.boardId,
          boardName: event.boardName,
        },
      );
    } catch (err) {
      logger.error({ err, cardId: event.cardId }, "kanban: card-assigned notify failed");
    }
  });
}

/** Test-only : clears the idempotency guard so a fresh bus can re-subscribe. */
export function _resetKanbanNotificationSubscriberForTesting(): void {
  registered = false;
}
