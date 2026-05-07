-- @monark/webhooks core module : operator-registered HTTP endpoints
-- that receive a fan-out of domain events. See the schema banner +
-- packages/webhooks/README.md for the lifecycle. Schema landing :
--
--   - WebhookEndpoint (operator-managed target URL + signing secret)
--   - WebhookSubscription (event-type filters, exact or prefix)
--   - WebhookDelivery (the outbox row per intended delivery)
--   - WebhookDeliveryAttempt (one row per HTTP attempt for debugging)
--   - WebhookEndpointStatus + WebhookDeliveryStatus enums

CREATE TYPE "WebhookEndpointStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed');

CREATE TABLE "WebhookEndpoint" (
    "id"                  TEXT NOT NULL,
    "organizationId"      TEXT,
    "url"                 TEXT NOT NULL,
    "description"         TEXT,
    "secretHash"          TEXT NOT NULL,
    "status"              "WebhookEndpointStatus" NOT NULL DEFAULT 'active',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "disabledAt"          TIMESTAMP(3),
    "disabledReason"      TEXT,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookEndpoint_organizationId_idx"
    ON "WebhookEndpoint"("organizationId");
CREATE INDEX "WebhookEndpoint_status_idx" ON "WebhookEndpoint"("status");

ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT
    "WebhookEndpoint_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookSubscription" (
    "id"         TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventType"  TEXT NOT NULL,
    "isPrefix"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookSubscription_endpointId_eventType_isPrefix_key"
    ON "WebhookSubscription"("endpointId", "eventType", "isPrefix");
CREATE INDEX "WebhookSubscription_endpointId_idx"
    ON "WebhookSubscription"("endpointId");
CREATE INDEX "WebhookSubscription_eventType_idx"
    ON "WebhookSubscription"("eventType");

ALTER TABLE "WebhookSubscription" ADD CONSTRAINT
    "WebhookSubscription_endpointId_fkey"
    FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookDelivery" (
    "id"             TEXT NOT NULL,
    "endpointId"     TEXT NOT NULL,
    "eventType"      TEXT NOT NULL,
    "payload"        JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status"         "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts"       INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt"    TIMESTAMP(3),
    "failedAt"       TIMESTAMP(3),
    "lastError"      TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookDelivery_idempotencyKey_key"
    ON "WebhookDelivery"("idempotencyKey");
CREATE INDEX "WebhookDelivery_endpointId_idx"
    ON "WebhookDelivery"("endpointId");
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx"
    ON "WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_eventType_idx"
    ON "WebhookDelivery"("eventType");

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT
    "WebhookDelivery_endpointId_fkey"
    FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WebhookDeliveryAttempt" (
    "id"            TEXT NOT NULL,
    "deliveryId"    TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"    TIMESTAMP(3),
    "statusCode"    INTEGER,
    "error"         TEXT,
    "durationMs"    INTEGER,

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDeliveryAttempt_deliveryId_idx"
    ON "WebhookDeliveryAttempt"("deliveryId");

ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT
    "WebhookDeliveryAttempt_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
