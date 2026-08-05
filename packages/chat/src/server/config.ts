// Branding for the assistant. The display name is configurable so a deploy can
// brand its assistant (Monark ships as "Chrysa"); it's read from
// CHAT_ASSISTANT_NAME with a default, and surfaced both in the system prompt
// (server) and the web UI (via the `chat.config` query). A per-org override
// (stored on the org) can layer on this later without changing call sites.
const DEFAULT_ASSISTANT_NAME = "Chrysa";

export function getAssistantName(): string {
  return process.env.CHAT_ASSISTANT_NAME?.trim() || DEFAULT_ASSISTANT_NAME;
}
