import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the automation module. The whole module (nav entry,
// editor, trigger engine, and worker) gates behind `automation.enabled`. Now
// that the module has shipped end-to-end it defaults **on** ; the flag stays so
// operators can still turn it off per-org / per-role via `/admin/feature-flags`.
const AUTOMATION_FLAGS = {
  enabled: {
    description:
      "Enable the Automation module: node-graph flows, the trigger engine, and the run worker.",
    defaultOn: true,
  },
} as const;

export function registerAutomationFeatureFlags(): void {
  registerFlags("automation", AUTOMATION_FLAGS);
}
