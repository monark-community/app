import { hasPermission } from "@monark/rbac/server";
import type { NodeExecutionContext } from "../registry";

/**
 * Re-check that the automation's owner holds a capability at execution time.
 * Runs act as their owner (`Automation.createdBy`), so a privileged node
 * (data write, role assignment, metadata write) can't let an automation do
 * more than its author could by hand. A run whose owner is gone (null) is
 * denied outright. Returns the owner id on success.
 */
export async function requireOwnerPermission(
  ctx: NodeExecutionContext,
  permission: string,
): Promise<string> {
  if (!ctx.actorUserId) {
    throw new Error(
      `This node requires an automation owner, but the run has none (${permission}).`,
    );
  }
  const ok = await hasPermission(ctx.actorUserId, permission, ctx.organizationId);
  if (!ok) {
    throw new Error(
      `The automation owner lacks the "${permission}" permission this node requires.`,
    );
  }
  return ctx.actorUserId;
}

/** Parse a config value that must be a JSON object (from a `json` field). */
export function parseJsonObject(raw: unknown, fieldName: string): Record<string, unknown> {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") throw new Error(`${fieldName} must be a JSON object.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${fieldName} is not valid JSON.`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

/** Best-effort parse of an arbitrary JSON value config, falling back to the raw string. */
export function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
