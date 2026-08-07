// Public surface of @monark/twitter/server — wired into services/api at boot.
// Write-only integration : no events, no inbound webhook. Registrations are the
// flag, the permission, the action nodes, and the connection router.
export { twitterRouter } from "./router";
export { registerTwitterFeatureFlags } from "./feature-flags";
export { registerTwitterPermissions } from "./permissions";
export { registerTwitterAutomationNodes } from "./nodes";
export { twitterCall } from "./client";
