import { randomBytes, timingSafeEqual } from "node:crypto";
import { parseGraph } from "../contracts/graph";
import { HTTP_TRIGGER_EVENT, HTTP_TRIGGER_TYPE } from "../contracts/triggers";
import { createPendingRun, findAutomationById } from "./data";

/** Generate a fresh HTTP-trigger secret (server-side ; shown once in the editor). */
export function generateHttpSecret(): string {
  return `atrig_${randomBytes(24).toString("base64url")}`;
}

/** Constant-time secret comparison that tolerates length mismatch. */
function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export type HttpTriggerResult =
  | { status: 202; runId: string }
  | { status: 401 | 404 | 409; error: string };

/**
 * Handle an inbound HTTP-trigger call: look up the automation, verify it's
 * enabled and has an HTTP trigger whose secret matches, then enqueue a run with
 * the request body as the trigger payload. Kept transport-agnostic so the API
 * service's Express route is a thin adapter. Never throws — returns a status +
 * message the route maps to a response.
 */
export async function handleHttpTrigger(params: {
  automationId: string;
  secret: string | null;
  body: unknown;
}): Promise<HttpTriggerResult> {
  const automation = await findAutomationById(params.automationId);
  if (!automation || automation.deletedAt) {
    return { status: 404, error: "Automation not found." };
  }
  const trigger = parseGraph(automation.graph).nodes.find((n) => n.type === HTTP_TRIGGER_TYPE);
  if (!trigger) {
    return { status: 404, error: "This automation has no HTTP trigger." };
  }
  const secret = typeof trigger.config.secret === "string" ? trigger.config.secret : "";
  if (!secret) {
    return { status: 409, error: "HTTP trigger has no secret configured yet." };
  }
  if (!params.secret || !secretsMatch(params.secret, secret)) {
    return { status: 401, error: "Invalid secret." };
  }
  if (!automation.enabled) {
    return { status: 409, error: "This automation is disabled." };
  }

  const run = await createPendingRun({
    automationId: automation.id,
    organizationId: automation.organizationId,
    triggerEventType: HTTP_TRIGGER_EVENT,
    // Synthetic trigger payload shaped like a domain event ; `body` carries the
    // caller's JSON so downstream nodes read `{{ trigger.body.* }}`.
    triggerPayload: {
      type: HTTP_TRIGGER_EVENT,
      organizationId: automation.organizationId,
      body: params.body ?? null,
      occurredAt: new Date().toISOString(),
    },
    manual: false,
    createdBy: automation.createdBy,
  });
  return { status: 202, runId: run.id };
}
