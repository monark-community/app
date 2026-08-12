// Side-effect import : activates the "achievements.awarded" notification-kind
// registry augmentation for any compilation that imports @monark/achievements/server.
import "../contracts/notifications";

export { achievementsRouter } from "./router";
export { registerAchievementsPermissions } from "./permissions";
export { registerAchievementsEventTypes } from "./event-types";
export { registerAchievementsFeatureFlags } from "./flags";
export { registerAchievementsNotificationKinds } from "./notification-kinds";
export {
  registerAchievementsSubscriber,
  _resetAchievementsSubscriberForTesting,
} from "./subscriber";
export {
  startAchievementsWorker,
  stopAchievementsWorker,
  achievementsTick,
  ACHIEVEMENTS_MAX_ATTEMPTS,
  ACHIEVEMENTS_WORKER_INTERVAL_MS,
} from "./worker";

// Data-layer surface (used by tests + any future consumer).
export {
  listAchievements,
  findAchievementById,
  createAchievement,
  updateAchievement,
  softDeleteAchievement,
  listRulesForAchievement,
  findRuleById,
  createRule,
  updateRule,
  deleteRule,
  getEnabledRulesForEvent,
  hasEnabledRuleForEvent,
  incrementProgress,
  awardIfAbsent,
  filterHumanUserIds,
  listAwardsForUser,
  listProgressForUser,
  summarizeAwardsForUser,
  enqueueOutbox,
  claimOutboxBatch,
  markOutboxDone,
  markOutboxRetryOrFail,
  ensureAchievementIconsBucket,
  resolveIconUrls,
  type AchievementRow,
  type AchievementRuleRow,
  type AchievementAwardRow,
  type AchievementOutboxRow,
} from "./data";
