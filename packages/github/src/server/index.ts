// Public surface of @monark/github/server — wired into services/api at boot.
export { githubRouter } from "./router";
export { registerGithubEventTypes } from "./event-types";
export { registerGithubFeatureFlags } from "./feature-flags";
export { registerGithubPermissions } from "./permissions";
export { registerGithubAutomationNodes } from "./nodes";
export { handleGithubWebhook, mapGithubEvent } from "./webhook";
export { githubRequest } from "./client";
