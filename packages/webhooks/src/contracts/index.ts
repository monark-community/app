export * from "./events";

// Tunables for the delivery worker. Exported so test harnesses can
// shrink them when exercising the retry loop.
export const WEBHOOK_DELIVERY_FAILURE_LIMIT = 5;
export const WEBHOOK_DELIVERY_BACKOFF_BASE_MS = 30_000;
export const WEBHOOK_DELIVERY_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000; // 6h cap
export const WEBHOOK_HTTP_TIMEOUT_MS = 10_000;
export const WEBHOOK_SIGNATURE_HEADER = "Webhook-Signature";
export const WEBHOOK_TIMESTAMP_HEADER = "Webhook-Timestamp";
export const WEBHOOK_DELIVERY_ID_HEADER = "Webhook-Delivery-Id";
export const WEBHOOK_IDEMPOTENCY_HEADER = "Webhook-Delivery-Idempotency-Key";
export const WEBHOOK_EVENT_TYPE_HEADER = "Webhook-Event-Type";
