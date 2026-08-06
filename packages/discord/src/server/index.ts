// Public surface of @monark/discord/server. A router-less integration: it
// contributes automation action nodes (write to Discord) + a feature flag, but
// no tRPC surface — the "connection" is just a bot-token / webhook-URL secret an
// operator adds under Admin → Secrets and references in a node.
export { registerDiscordFeatureFlags } from "./feature-flags";
export { registerDiscordAutomationNodes } from "./nodes";
export { discordRequest } from "./client";
