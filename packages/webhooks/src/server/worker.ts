import { emit, logger } from "@monark/common";
import {
  WEBHOOK_DELIVERY_BACKOFF_BASE_MS,
  WEBHOOK_DELIVERY_BACKOFF_MAX_MS,
  WEBHOOK_DELIVERY_FAILURE_LIMIT,
  WEBHOOK_HTTP_TIMEOUT_MS,
} from "../contracts/index";
import type {
  WebhookDeliveryFailedEvent,
  WebhookDeliverySucceededEvent,
  WebhookEndpointDisabledEvent,
} from "../contracts/events";
import {
  disableEndpointForFailures,
  listPendingDueDeliveries,
  markDeliveryFailed,
  markDeliveryRetry,
  markDeliverySucceeded,
  recordAttempt,
  type DeliveryWithEndpoint,
} from "./data";
import { buildDeliveryHeaders } from "./secrets";
import { resolveSecret } from "./secret-store";

// In production each api process runs the worker on a 5s cadence ; the
// `/cron/sweep-webhook-deliveries` endpoint exists as an external
// fallback (Vercel Cron, GitHub Actions, k8s CronJob) so a single api
// crash doesn't strand the outbox.
export const WEBHOOK_WORKER_INTERVAL_MS = 5_000;
const WORKER_BATCH_SIZE = 50;

let timer: NodeJS.Timeout | null = null;
let inFlight = false;

export function startWebhookDeliveryWorker(options?: {
  intervalMs?: number;
  batchSize?: number;
}): void {
  if (timer) return;
  const interval = options?.intervalMs ?? WEBHOOK_WORKER_INTERVAL_MS;
  const batchSize = options?.batchSize ?? WORKER_BATCH_SIZE;
  timer = setInterval(() => {
    void tickOnce(batchSize);
  }, interval);
  // Don't keep the event loop alive for the worker alone — when the
  // api shuts down (test / dev hot-reload), the timer should let the
  // process exit.
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs: interval, batchSize }, "webhook delivery worker started");
}

export function stopWebhookDeliveryWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function tickOnce(batchSize = WORKER_BATCH_SIZE): Promise<{
  processed: number;
}> {
  if (inFlight) return { processed: 0 };
  inFlight = true;
  try {
    const due = await listPendingDueDeliveries(batchSize);
    for (const delivery of due) {
      await deliverOne(delivery);
    }
    return { processed: due.length };
  } finally {
    inFlight = false;
  }
}

/**
 * One delivery attempt against one endpoint. Caller is the worker
 * loop (`tickOnce`) or the manual-retry tRPC procedure ; both paths
 * land here so the recording, signing, and event emission stay in
 * one place.
 */
export async function deliverOne(
  delivery: DeliveryWithEndpoint,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const attemptNumber = delivery.attempts + 1;
  const startedAt = new Date();
  const body = JSON.stringify({
    type: delivery.eventType,
    data: delivery.payload,
  });
  let statusCode: number | null = null;
  let error: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_HTTP_TIMEOUT_MS);
    try {
      // Resolved through the active SecretStore — in-memory by default
      // (populated at create + rotate by the router), file-backed in
      // dev when `MONARK_DEV_WEBHOOK_SECRETS_FILE` is set, swappable
      // for AWS Secrets Manager / Vault / etc. via
      // `setWebhookSecretStore()` at api boot.
      const secret = await resolveSecret(delivery.endpointId);
      if (!secret) {
        throw new Error(
          "no plaintext secret available for endpoint ; rotate the secret to re-arm signing",
        );
      }
      const headers = buildDeliveryHeaders({
        secret,
        body,
        deliveryId: delivery.id,
        idempotencyKey: delivery.idempotencyKey,
        eventType: delivery.eventType,
      });
      const response = await fetchImpl(delivery.endpoint.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      statusCode = response.status;
      if (response.status >= 200 && response.status < 300) {
        const finishedAt = new Date();
        await recordAttempt({
          deliveryId: delivery.id,
          attemptNumber,
          startedAt,
          finishedAt,
          statusCode,
          error: null,
        });
        await markDeliverySucceeded({
          deliveryId: delivery.id,
          endpointId: delivery.endpointId,
        });
        const successEvent: WebhookDeliverySucceededEvent = {
          type: "webhook.delivery-succeeded",
          endpointId: delivery.endpointId,
          organizationId: delivery.endpoint.organizationId,
          endpointUrl: delivery.endpoint.url,
          deliveryId: delivery.id,
          eventType: delivery.eventType,
          attemptNumber,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          occurredAt: finishedAt,
        };
        await emit(successEvent).catch(() => {});
        return;
      }
      // 4xx is treated the same as 5xx for retry purposes — receivers
      // sometimes return 429 / 503 transiently. The hard cap shuts
      // down endpoints that consistently 4xx.
      error = `HTTP ${response.status}`;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const finishedAt = new Date();
  await recordAttempt({
    deliveryId: delivery.id,
    attemptNumber,
    startedAt,
    finishedAt,
    statusCode,
    error,
  });

  const exhausted = attemptNumber >= WEBHOOK_DELIVERY_FAILURE_LIMIT;
  if (exhausted) {
    await markDeliveryFailed({
      deliveryId: delivery.id,
      endpointId: delivery.endpointId,
      attempts: attemptNumber,
      lastError: error ?? "unknown",
    });
    const failureEvent: WebhookDeliveryFailedEvent = {
      type: "webhook.delivery-failed",
      endpointId: delivery.endpointId,
      organizationId: delivery.endpoint.organizationId,
      endpointUrl: delivery.endpoint.url,
      deliveryId: delivery.id,
      eventType: delivery.eventType,
      attemptNumber,
      permanent: true,
      reason: error ?? "unknown",
      occurredAt: finishedAt,
    };
    await emit(failureEvent).catch(() => {});
    await maybeAutoDisable(delivery.endpointId);
    return;
  }

  const nextAttemptAt = new Date(
    Date.now() +
      Math.min(
        WEBHOOK_DELIVERY_BACKOFF_BASE_MS * 2 ** (attemptNumber - 1),
        WEBHOOK_DELIVERY_BACKOFF_MAX_MS,
      ),
  );
  await markDeliveryRetry({
    deliveryId: delivery.id,
    endpointId: delivery.endpointId,
    nextAttemptAt,
    attempts: attemptNumber,
    lastError: error ?? "unknown",
  });
  const retryEvent: WebhookDeliveryFailedEvent = {
    type: "webhook.delivery-failed",
    endpointId: delivery.endpointId,
    organizationId: delivery.endpoint.organizationId,
    endpointUrl: delivery.endpoint.url,
    deliveryId: delivery.id,
    eventType: delivery.eventType,
    attemptNumber,
    permanent: false,
    reason: error ?? "unknown",
    occurredAt: finishedAt,
  };
  await emit(retryEvent).catch(() => {});
}

async function maybeAutoDisable(endpointId: string): Promise<void> {
  const { getDb } = await import("@monark/db");
  const db = getDb();
  const endpoint = await db.webhookEndpoint.findUnique({
    where: { id: endpointId },
    select: {
      id: true,
      organizationId: true,
      consecutiveFailures: true,
      status: true,
    },
  });
  if (!endpoint) return;
  if (endpoint.status !== "active") return;
  if (endpoint.consecutiveFailures < WEBHOOK_DELIVERY_FAILURE_LIMIT) return;

  await disableEndpointForFailures({
    endpointId: endpoint.id,
    reason: `auto-disabled after ${endpoint.consecutiveFailures} consecutive failures`,
  });
  const event: WebhookEndpointDisabledEvent = {
    type: "webhook.endpoint-disabled-after-failures",
    endpointId: endpoint.id,
    organizationId: endpoint.organizationId,
    consecutiveFailures: endpoint.consecutiveFailures,
    occurredAt: new Date(),
  };
  await emit(event).catch(() => {});
}
