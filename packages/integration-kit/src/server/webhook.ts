import { createHmac, timingSafeEqual } from "node:crypto";
import { emit, logger } from "@monark/common";
import type { DomainEvent } from "@monark/common/contracts/events";
import { getSecretValue } from "@monark/secrets/server";

/**
 * Constant-time HMAC-SHA256 check of a provider's signature header over the raw
 * request body. `prefix` is the string the provider prepends to the hex digest
 * (GitHub: `"sha256="`; many others: `""`).
 */
export function verifyHmacSha256(
  rawBody: Buffer,
  secret: string,
  signature: string | null,
  opts: { prefix?: string } = {},
): boolean {
  if (!signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = `${opts.prefix ?? ""}${digest}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type InboundWebhookResult =
  | { status: 202; emitted: boolean }
  | { status: 401 | 404; error: string };

export interface InboundWebhookParams {
  organizationId: string;
  /** The provider's event-name header (e.g. GitHub's `X-GitHub-Event`). */
  eventName: string;
  /** The provider's signature header (e.g. `X-Hub-Signature-256`). */
  signature: string | null;
  /** The exact bytes received (needed to verify the signature). */
  rawBody: Buffer;
  /** The parsed JSON body. */
  payload: unknown;
}

/**
 * Build an inbound-webhook handler for an automation integration: resolve the
 * org's signing secret from the `@monark/secrets` substrate, verify the
 * signature, translate the delivery to a domain event, and emit it (where the
 * automation subscriber picks it up to fire matching flows). Everything an
 * integration must supply is provider-specific: the `secretKey`, how to
 * `verify`, and how to `map`. A delivery we don't model returns 202 (ack) so
 * the provider doesn't retry ; a missing connection 404 ; a bad signature 401.
 */
export function defineInboundWebhook<E extends DomainEvent>(config: {
  /** Secrets-substrate key holding this org's signing secret. */
  secretKey: string;
  /** Verify the raw body against the org's secret + the provider's signature. */
  verify: (rawBody: Buffer, secret: string, signature: string | null) => boolean;
  /** Translate a delivery to a domain event, or null to ack-and-ignore. */
  map: (eventName: string, payload: unknown, organizationId: string) => E | null;
  /** Integration name, for diagnostics on an emit failure. */
  label: string;
}): (params: InboundWebhookParams) => Promise<InboundWebhookResult> {
  return async (params) => {
    const secret = await getSecretValue(params.organizationId, config.secretKey);
    if (!secret) return { status: 404, error: "not-configured" };
    if (!config.verify(params.rawBody, secret, params.signature)) {
      return { status: 401, error: "invalid-signature" };
    }
    const event = config.map(params.eventName, params.payload, params.organizationId);
    if (!event) return { status: 202, emitted: false };
    try {
      await emit(event);
    } catch (err) {
      logger.error({ err, type: event.type, integration: config.label }, "failed to emit event");
    }
    return { status: 202, emitted: true };
  };
}
