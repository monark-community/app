// Public surface of @monark/automation/server.

export { automationRouter } from "./router";

// Boot registrations (wired in services/api/src/server.ts).
export { registerAutomationPermissions } from "./permissions";
export { registerAutomationEventTypes } from "./event-types";
export { registerAutomationFeatureFlags } from "./feature-flags";
export { registerAutomationNotificationKinds } from "./notification-kinds";
export { registerBuiltinAutomationNodes } from "./nodes";
export { registerAutomationSearchSource } from "./search-source";
export { registerAutomationSubscribers, _resetAutomationSubscribersForTesting } from "./subscriber";
export {
  startAutomationWorker,
  stopAutomationWorker,
  automationTick,
  AUTOMATION_WORKER_INTERVAL_MS,
  AUTOMATION_MAX_ATTEMPTS,
} from "./worker";
// The scheduler for cron-like triggers (also driven by the worker loop) —
// exported for the `/cron/run-automation-schedules` fallback endpoint + tests.
export { runDueSchedules } from "./scheduler";

// The node-type extension API + engine (for other modules' nodes + tests).
export {
  registerAutomationNodes,
  getAutomationNode,
  listAutomationNodeDescriptors,
  defineNode,
  _resetAutomationNodesForTesting,
  type AnyAutomationNode,
  type NodeExecutionContext,
  type NodeDescriptorMeta,
} from "./registry";
export { executeGraph, executionOrder, interpolateConfig } from "./engine";
export { handleHttpTrigger, generateHttpSecret, type HttpTriggerResult } from "./http-trigger";

// Data layer.
export {
  serializeAutomation,
  listAutomations,
  findAutomationById,
  createAutomation,
  updateAutomation,
  softDeleteAutomation,
  restoreAutomation,
  hardDeleteAutomation,
  listAutomationRuns,
  findAutomationRunById,
  findEnabledAutomationsForEvent,
  createPendingRun,
  listPendingDueRuns,
  claimRun,
  markRunSucceeded,
  markRunForRetry,
  markRunFailed,
  addRunStep,
  finishRunStep,
} from "./data";
export type {
  AutomationRow,
  AutomationRunRow,
  AutomationRunStepRow,
  AutomationRunWithSteps,
  SerializedAutomation,
  ListAutomationsInput,
  CreateAutomationInput,
  UpdateAutomationPatch,
  ListAutomationRunsInput,
  CreatePendingRunInput,
} from "./data";
