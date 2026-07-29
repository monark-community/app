import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions for the automation module's own events, so they
// appear (grouped under "automation") in the webhooks subscription picker.
const AUTOMATION_EVENT_TYPES = {
  "automation.created": {
    description: "An automation flow was created.",
    fields: [
      { key: "automationId", type: "string", description: "The automation flow that was created." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the automation belongs to.",
      },
      { key: "name", type: "string", description: "The automation flow's name." },
      { key: "actorId", type: "string", description: "The user who created the automation." },
    ],
  },
  "automation.updated": {
    description: "An automation flow was edited.",
    fields: [
      { key: "automationId", type: "string", description: "The automation flow that was edited." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the automation belongs to.",
      },
      { key: "actorId", type: "string", description: "The user who edited the automation." },
    ],
  },
  "automation.deleted": {
    description: "An automation flow was deleted.",
    fields: [
      { key: "automationId", type: "string", description: "The automation flow that was deleted." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the automation belonged to.",
      },
      { key: "actorId", type: "string", description: "The user who deleted the automation." },
    ],
  },
  "automation.run-started": {
    description: "An automation run began executing.",
    fields: [
      { key: "automationId", type: "string", description: "The automation whose run began." },
      { key: "runId", type: "string", description: "The run instance's id." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the automation belongs to.",
      },
      {
        key: "triggerEventType",
        type: "string",
        description: "The event type that triggered the run.",
      },
    ],
  },
  "automation.run-succeeded": {
    description: "An automation run finished successfully.",
    fields: [
      { key: "automationId", type: "string", description: "The automation whose run succeeded." },
      { key: "runId", type: "string", description: "The run instance's id." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the automation belongs to.",
      },
      {
        key: "triggerEventType",
        type: "string",
        description: "The event type that triggered the run.",
      },
      { key: "durationMs", type: "number", description: "How long the run took to complete." },
    ],
  },
  "automation.run-failed": {
    description: "An automation run failed after exhausting retries.",
    fields: [
      { key: "automationId", type: "string", description: "The automation whose run failed." },
      { key: "runId", type: "string", description: "The run instance's id." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the automation belongs to.",
      },
      {
        key: "triggerEventType",
        type: "string",
        description: "The event type that triggered the run.",
      },
      { key: "error", type: "string", description: "The error that failed the run." },
    ],
  },
} as const;

export function registerAutomationEventTypes(): void {
  registerEventTypes("automation", AUTOMATION_EVENT_TYPES);
}
