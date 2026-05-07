import { createHash, createHmac, randomBytes } from "node:crypto"
import {
  WEBHOOK_DELIVERY_ID_HEADER,
  WEBHOOK_EVENT_TYPE_HEADER,
  WEBHOOK_IDEMPOTENCY_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from "../contracts/index"

/**
 * Generates a fresh signing secret + its SHA-256 hash. The plaintext
 * is returned exactly once at endpoint creation / rotation time so the
 * operator can configure the receiver ; the DB only sees the hash so
 * a database leak doesn't compromise endpoint signatures.
 */
export function mintSecret(): { plaintext: string; hash: string } {
  const plaintext = `whsec_${randomBytes(32).toString("base64url")}`
  const hash = createHash("sha256").update(plaintext).digest("hex")
  return { plaintext, hash }
}

/** Reproducibly hashes a plaintext secret for a constant-time compare. */
export function hashSecret(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex")
}

/**
 * Body signature scheme :
 *   `v1=<hex hmac sha256(secret, "<timestamp>.<body>")>`
 *
 * Receivers reconstruct the signed input from the request headers
 * + body and compare against the `Webhook-Signature` header. Including
 * the timestamp in the signed payload prevents replay outside the
 * receiver's tolerance window (we suggest ±5 minutes).
 */
export function signBody(input: {
  secret: string
  timestamp: number
  body: string
}): string {
  const signed = `${input.timestamp}.${input.body}`
  const mac = createHmac("sha256", input.secret).update(signed).digest("hex")
  return `v1=${mac}`
}

/**
 * Builds the headers attached to every outbound delivery request.
 * Idempotency key + delivery id come from the persisted row ; the
 * timestamp is recomputed at attempt time so a long-queued delivery
 * doesn't carry a stale stamp through retries.
 */
export function buildDeliveryHeaders(input: {
  secret: string
  body: string
  deliveryId: string
  idempotencyKey: string
  eventType: string
  timestamp?: number
}): Record<string, string> {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
  const signature = signBody({
    secret: input.secret,
    timestamp,
    body: input.body,
  })
  return {
    "Content-Type": "application/json",
    "User-Agent": "monark-webhooks/1",
    [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
    [WEBHOOK_SIGNATURE_HEADER]: signature,
    [WEBHOOK_DELIVERY_ID_HEADER]: input.deliveryId,
    [WEBHOOK_IDEMPOTENCY_HEADER]: input.idempotencyKey,
    [WEBHOOK_EVENT_TYPE_HEADER]: input.eventType,
  }
}

/**
 * Stable idempotency key per (endpoint, event). Receivers use this to
 * dedupe retries. We hash the endpoint id + event type + the event's
 * own correlationId (preferred) or its full payload (fallback). The
 * key is unique per intended delivery, not per retry attempt — every
 * retry of the same row reuses the same key.
 */
export function computeIdempotencyKey(input: {
  endpointId: string
  eventType: string
  correlationId?: string
  payload: unknown
}): string {
  const basis =
    input.correlationId ??
    createHash("sha256").update(JSON.stringify(input.payload)).digest("hex")
  return createHash("sha256")
    .update(`${input.endpointId}:${input.eventType}:${basis}`)
    .digest("hex")
    .slice(0, 48)
}
