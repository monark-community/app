import type { DomainEventBase } from "@monark/common/contracts/events";

/**
 * Emitted when a user earns an achievement (threshold crossed, awarded once).
 * `actorId` mirrors `userId` (the recipient) so a **meta-achievement** — one
 * watching `achievements.awarded` with the default `actorId` subject — credits
 * the earner, making achievements chainable ("earn 5 achievements").
 */
export interface AchievementsAwardedEvent extends DomainEventBase {
  type: "achievements.awarded";
  organizationId: string;
  achievementId: string;
  achievementName: string;
  points: number;
  /** The user who earned it. */
  userId: string;
  /** Same as `userId` — the conventional actor field, so this event is itself a
   *  valid achievement trigger. */
  actorId: string;
}

export type AchievementsEvents = AchievementsAwardedEvent;
