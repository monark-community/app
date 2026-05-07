import type { DomainEventBase } from "@monark/common/contracts/events"

export type WebhookEndpointCreatedEvent = DomainEventBase & {
  type: "webhook.endpoint-created"
  endpointId: string
  organizationId: string | null
  url: string
  actorId: string
}

export type WebhookEndpointUpdatedEvent = DomainEventBase & {
  type: "webhook.endpoint-updated"
  endpointId: string
  organizationId: string | null
  changed: Array<"name" | "url" | "description" | "subscriptions" | "status">
  actorId: string
}

export type WebhookEndpointDeletedEvent = DomainEventBase & {
  type: "webhook.endpoint-deleted"
  endpointId: string
  organizationId: string | null
  actorId: string
}

export type WebhookEndpointSecretRotatedEvent = DomainEventBase & {
  type: "webhook.endpoint-secret-rotated"
  endpointId: string
  organizationId: string | null
  actorId: string
}

export type WebhookEndpointDisabledEvent = DomainEventBase & {
  type: "webhook.endpoint-disabled-after-failures"
  endpointId: string
  organizationId: string | null
  consecutiveFailures: number
}

export type WebhookDeliverySucceededEvent = DomainEventBase & {
  type: "webhook.delivery-succeeded"
  endpointId: string
  /** Mirrors the parent endpoint's scope ; null for platform-tier. */
  organizationId: string | null
  /** Endpoint URL at the time of delivery — convenient for subscribers
   * (operator notifications) that want to identify the endpoint
   * without a DB roundtrip. */
  endpointUrl: string
  deliveryId: string
  eventType: string
  attemptNumber: number
  durationMs: number
}

export type WebhookDeliveryFailedEvent = DomainEventBase & {
  type: "webhook.delivery-failed"
  endpointId: string
  /** Mirrors the parent endpoint's scope ; null for platform-tier. */
  organizationId: string | null
  /** Endpoint URL at the time of delivery — convenient for subscribers
   * (operator notifications) that want to identify the endpoint
   * without a DB roundtrip. */
  endpointUrl: string
  deliveryId: string
  eventType: string
  attemptNumber: number
  /** True when retries are exhausted ; the delivery row's `failedAt` is set. */
  permanent: boolean
  reason: string
}

export type WebhooksEvents =
  | WebhookEndpointCreatedEvent
  | WebhookEndpointUpdatedEvent
  | WebhookEndpointDeletedEvent
  | WebhookEndpointSecretRotatedEvent
  | WebhookEndpointDisabledEvent
  | WebhookDeliverySucceededEvent
  | WebhookDeliveryFailedEvent
