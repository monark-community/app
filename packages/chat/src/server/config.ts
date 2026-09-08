import { isEnabled } from "@monark/feature-flags/server";
import { getOrganizationMetadataValue } from "@monark/organizations/server";

// Branding for the assistant. The display name is configurable at three
// levels, most specific first :
//
//   1. per-organization — an `assistant-name` row in the org metadata sidecar,
//      edited from the org settings form and gated by the `chat.org-branding`
//      flag ;
//   2. per-deploy — the `CHAT_ASSISTANT_NAME` env var ;
//   3. the shipped default, "Chrysa" (named for *chrysalide*, on-brand with
//      Monark).
//
// The resolved name is surfaced both in the system prompt (server) and the web
// UI (via the `chat.config` query), so a rename lands everywhere at once.
//
// The sidecar rather than a column on `Organization` : this is a single
// unindexed string nobody filters or sorts on, which is exactly the case
// CLAUDE.md points at the metadata sidecar for — no migration, no core schema
// change.
const DEFAULT_ASSISTANT_NAME = "Chrysa";

/** Metadata sidecar coordinates for the per-org override. */
export const CHAT_METADATA_MODULE = "chat";
export const ASSISTANT_NAME_KEY = "assistant-name";

/** Feature flag gating the per-org override (resolution *and* the org form). */
export const CHAT_ORG_BRANDING_FLAG = "chat.org-branding";

/** Max length of a per-org assistant name. Long enough for a real name, short
 * enough to sit in a chat header and a system-prompt sentence without
 * swallowing them. */
export const ASSISTANT_NAME_MAX_LENGTH = 40;

/**
 * The deploy-wide assistant name : `CHAT_ASSISTANT_NAME`, else the shipped
 * default. This is the fallback every org inherits until it sets its own, and
 * the only answer available where there is no org in scope.
 */
export function getDefaultAssistantName(): string {
  return process.env.CHAT_ASSISTANT_NAME?.trim() || DEFAULT_ASSISTANT_NAME;
}

/**
 * Read one org's stored override, ignoring the feature flag. Returns `null`
 * when the org has never set one (or stored a non-string / blank value, which
 * only a hand-edited row could produce). Used by the settings form, which has
 * to show the operator what is actually stored even while the flag is off.
 */
export async function getOrganizationAssistantName(organizationId: string): Promise<string | null> {
  const stored = await getOrganizationMetadataValue(
    organizationId,
    CHAT_METADATA_MODULE,
    ASSISTANT_NAME_KEY,
  ).catch(() => undefined);
  if (typeof stored !== "string") return null;
  const trimmed = stored.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The effective assistant name for a principal. Falls back to
 * {@link getDefaultAssistantName} whenever there is no org in scope, the
 * `chat.org-branding` flag is off for that org, or the org hasn't set a name —
 * so the env-var contract keeps working untouched on a deploy that never turns
 * the flag on.
 *
 * Best-effort by design : a flag-service or sidecar read that fails degrades to
 * the deploy default rather than breaking a chat turn over branding.
 */
export async function getAssistantName(scope?: {
  organizationId?: string | null;
  userId?: string | null;
}): Promise<string> {
  const fallback = getDefaultAssistantName();
  const organizationId = scope?.organizationId;
  if (!organizationId) return fallback;

  const flagOn = await isEnabled(CHAT_ORG_BRANDING_FLAG, {
    organizationId,
    userId: scope?.userId ?? undefined,
  }).catch(() => false);
  if (!flagOn) return fallback;

  return (await getOrganizationAssistantName(organizationId)) ?? fallback;
}
