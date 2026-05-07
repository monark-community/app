import { getDb, type Prisma } from "@monark/db"

export type EndpointRow = Prisma.WebhookEndpointGetPayload<Record<string, never>>
export type EndpointWithSubs = Prisma.WebhookEndpointGetPayload<{
  include: { subscriptions: true }
}>
export type DeliveryRow = Prisma.WebhookDeliveryGetPayload<Record<string, never>>
export type DeliveryWithEndpoint = Prisma.WebhookDeliveryGetPayload<{
  include: { endpoint: true }
}>
export type AttemptRow = Prisma.WebhookDeliveryAttemptGetPayload<
  Record<string, never>
>

export type SubscriptionInput = { eventType: string; isPrefix: boolean }

export async function findEndpointById(
  id: string,
): Promise<EndpointWithSubs | null> {
  const db = getDb()
  return db.webhookEndpoint.findUnique({
    where: { id },
    include: { subscriptions: true },
  })
}

export async function listEndpointsForOrg(
  organizationId: string | null,
): Promise<EndpointWithSubs[]> {
  const db = getDb()
  return db.webhookEndpoint.findMany({
    where: { organizationId },
    include: { subscriptions: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function listAllEndpoints(): Promise<EndpointWithSubs[]> {
  const db = getDb()
  return db.webhookEndpoint.findMany({
    include: { subscriptions: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function createEndpoint(input: {
  organizationId: string | null
  name: string
  url: string
  description: string | null
  secretHash: string
  subscriptions: SubscriptionInput[]
}): Promise<EndpointWithSubs> {
  const db = getDb()
  return db.$transaction(async (tx) => {
    const endpoint = await tx.webhookEndpoint.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        url: input.url,
        description: input.description,
        secretHash: input.secretHash,
      },
    })
    if (input.subscriptions.length > 0) {
      await tx.webhookSubscription.createMany({
        data: input.subscriptions.map((s) => ({
          endpointId: endpoint.id,
          eventType: s.eventType,
          isPrefix: s.isPrefix,
        })),
      })
    }
    return tx.webhookEndpoint.findUniqueOrThrow({
      where: { id: endpoint.id },
      include: { subscriptions: true },
    })
  })
}

export async function updateEndpointPatch(input: {
  id: string
  name?: string
  url?: string
  description?: string | null
  status?: "active" | "disabled"
  disabledReason?: string | null
  subscriptions?: SubscriptionInput[]
}): Promise<EndpointWithSubs> {
  const db = getDb()
  return db.$transaction(async (tx) => {
    const patch: Prisma.WebhookEndpointUpdateInput = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.url !== undefined) patch.url = input.url
    if (input.description !== undefined) patch.description = input.description
    if (input.status !== undefined) {
      patch.status = input.status
      patch.disabledAt =
        input.status === "disabled" ? new Date() : null
      patch.disabledReason =
        input.status === "disabled" ? input.disabledReason ?? null : null
      // Successful re-enable resets the failure counter so a healthy
      // run starts the disable countdown fresh.
      if (input.status === "active") {
        patch.consecutiveFailures = 0
      }
    }
    if (Object.keys(patch).length > 0) {
      await tx.webhookEndpoint.update({ where: { id: input.id }, data: patch })
    }
    if (input.subscriptions !== undefined) {
      await tx.webhookSubscription.deleteMany({
        where: { endpointId: input.id },
      })
      if (input.subscriptions.length > 0) {
        await tx.webhookSubscription.createMany({
          data: input.subscriptions.map((s) => ({
            endpointId: input.id,
            eventType: s.eventType,
            isPrefix: s.isPrefix,
          })),
        })
      }
    }
    return tx.webhookEndpoint.findUniqueOrThrow({
      where: { id: input.id },
      include: { subscriptions: true },
    })
  })
}

export async function rotateEndpointSecret(input: {
  id: string
  secretHash: string
}): Promise<void> {
  const db = getDb()
  await db.webhookEndpoint.update({
    where: { id: input.id },
    data: { secretHash: input.secretHash },
  })
}

export async function deleteEndpoint(id: string): Promise<void> {
  const db = getDb()
  await db.webhookEndpoint.delete({ where: { id } })
}

/**
 * Queries every active endpoint whose subscription set matches the
 * given event type. Exact subscriptions match `eventType =
 * <type>` ; prefix subscriptions match when the type starts with the
 * subscription string. Org-scoping is applied downstream in the
 * subscriber (see [subscribers.ts](./subscribers.ts) for the full
 * routing rules) ; this function returns every candidate so the
 * subscriber can pick.
 */
export async function findMatchingEndpoints(
  eventType: string,
): Promise<EndpointRow[]> {
  const db = getDb()
  // Exact-match path : a single index hit on (eventType).
  const exact = db.webhookSubscription.findMany({
    where: { eventType, isPrefix: false },
    select: {
      endpoint: true,
    },
  })
  // Prefix-match path : Postgres can't index this side, but the prefix
  // set is small (one row per `<module>.` style filter). We pull every
  // prefix sub and filter in memory.
  const prefixes = db.webhookSubscription.findMany({
    where: { isPrefix: true },
    select: {
      eventType: true,
      endpoint: true,
    },
  })
  const [exactRows, prefixRows] = await Promise.all([exact, prefixes])
  const map = new Map<string, EndpointRow>()
  for (const row of exactRows) {
    if (row.endpoint.status === "active") map.set(row.endpoint.id, row.endpoint)
  }
  for (const row of prefixRows) {
    if (eventType.startsWith(row.eventType) && row.endpoint.status === "active") {
      map.set(row.endpoint.id, row.endpoint)
    }
  }
  return [...map.values()]
}

/**
 * Writes one outbox row per matching endpoint for an event. Returns
 * the rows created so a caller (the subscriber) can immediately
 * trigger a delivery worker tick instead of waiting for the next
 * setInterval. Idempotency-key conflicts swallow silently so a retry
 * of the *source* mutation doesn't double-create deliveries.
 */
export async function enqueueDeliveries(input: {
  matches: Array<{
    endpointId: string
    idempotencyKey: string
  }>
  eventType: string
  payload: unknown
  client?: Prisma.TransactionClient
}): Promise<DeliveryRow[]> {
  const client = input.client ?? getDb()
  const created: DeliveryRow[] = []
  for (const match of input.matches) {
    try {
      const row = await client.webhookDelivery.create({
        data: {
          endpointId: match.endpointId,
          eventType: input.eventType,
          payload: input.payload as never,
          idempotencyKey: match.idempotencyKey,
        },
      })
      created.push(row)
    } catch (err) {
      // Unique-violation means this delivery already exists ; safely
      // skip so retries of the source mutation are idempotent.
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        continue
      }
      throw err
    }
  }
  return created
}

export async function listPendingDueDeliveries(
  limit: number,
): Promise<DeliveryWithEndpoint[]> {
  const db = getDb()
  return db.webhookDelivery.findMany({
    where: {
      status: "pending",
      nextAttemptAt: { lte: new Date() },
    },
    include: { endpoint: true },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  })
}

export async function recordAttempt(input: {
  deliveryId: string
  attemptNumber: number
  startedAt: Date
  finishedAt: Date
  statusCode: number | null
  error: string | null
}): Promise<AttemptRow> {
  const db = getDb()
  return db.webhookDeliveryAttempt.create({
    data: {
      deliveryId: input.deliveryId,
      attemptNumber: input.attemptNumber,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      statusCode: input.statusCode,
      error: input.error,
      durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    },
  })
}

export async function markDeliverySucceeded(input: {
  deliveryId: string
  endpointId: string
}): Promise<void> {
  const db = getDb()
  await db.$transaction([
    db.webhookDelivery.update({
      where: { id: input.deliveryId },
      data: {
        status: "delivered",
        deliveredAt: new Date(),
      },
    }),
    db.webhookEndpoint.update({
      where: { id: input.endpointId },
      data: { consecutiveFailures: 0 },
    }),
  ])
}

export async function markDeliveryRetry(input: {
  deliveryId: string
  endpointId: string
  nextAttemptAt: Date
  attempts: number
  lastError: string
}): Promise<void> {
  const db = getDb()
  await db.$transaction([
    db.webhookDelivery.update({
      where: { id: input.deliveryId },
      data: {
        attempts: input.attempts,
        nextAttemptAt: input.nextAttemptAt,
        lastError: input.lastError.slice(0, 1000),
      },
    }),
    db.webhookEndpoint.update({
      where: { id: input.endpointId },
      data: { consecutiveFailures: { increment: 1 } },
    }),
  ])
}

export async function markDeliveryFailed(input: {
  deliveryId: string
  endpointId: string
  attempts: number
  lastError: string
}): Promise<void> {
  const db = getDb()
  await db.$transaction([
    db.webhookDelivery.update({
      where: { id: input.deliveryId },
      data: {
        status: "failed",
        attempts: input.attempts,
        failedAt: new Date(),
        lastError: input.lastError.slice(0, 1000),
      },
    }),
    db.webhookEndpoint.update({
      where: { id: input.endpointId },
      data: { consecutiveFailures: { increment: 1 } },
    }),
  ])
}

export async function disableEndpointForFailures(input: {
  endpointId: string
  reason: string
}): Promise<void> {
  const db = getDb()
  await db.webhookEndpoint.update({
    where: { id: input.endpointId },
    data: {
      status: "disabled",
      disabledAt: new Date(),
      disabledReason: input.reason.slice(0, 280),
    },
  })
}

// Listing rows for the admin UI. Drops the `payload` Json column to
// keep tRPC's inference shallow (Prisma's `JsonValue` is recursive ;
// when it propagates through the tRPC client generic the depth-limit
// trips TS2589 on the consuming page). The detail view fetches the
// full row including payload through `findDeliveryById`.
export type DeliveryListRow = {
  id: string
  endpointId: string
  eventType: string
  idempotencyKey: string
  status: "pending" | "delivered" | "failed"
  attempts: number
  nextAttemptAt: Date
  deliveredAt: Date | null
  failedAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Returns every active organization id the user is a member of. Used
 * by the subscriber to fan user-tied events (`user.signed-in`,
 * `notification.created`, …) out to org-scoped endpoints whose org
 * the user belongs to. Membership rows with `leftAt` set are
 * excluded so a former member's later events don't reach an org's
 * endpoint after they've been removed.
 *
 * Reads `OrganizationMembership` directly. The model is owned by
 * `@monark/organizations` ; webhook routing reads it because that's
 * where the cross-cutting fan-out logic naturally lives. If the
 * organizations module ever needs to gate this read, expose a
 * `getUserOrgIds()` helper there and switch the import.
 */
export async function findUserMemberOrgIds(
  userId: string,
): Promise<string[]> {
  const db = getDb()
  const rows = await db.organizationMembership.findMany({
    where: { userId, leftAt: null },
    select: { organizationId: true },
  })
  return rows.map((r) => r.organizationId)
}

/**
 * Returns the single non-deleted org id when there's exactly one,
 * `null` otherwise. Used by the subscriber's single-tenant fallback
 * for user-tied events : if the deploy has exactly one org and the
 * user has no formal `OrganizationMembership` row yet (e.g. they
 * signed up before the auto-membership subscriber landed and a
 * sign-in hasn't backfilled them), treat the singleton as the
 * implicit org so the operator's org-scoped endpoint still receives
 * the event.
 *
 * Doesn't check the multi-tenant feature flag here ; the subscriber
 * only consults this fallback after the membership lookup returned
 * empty, and a multi-tenant deploy with exactly one org is unusual
 * enough that the fallback's behavior matches what the operator
 * almost certainly wants.
 */
export async function findOnlySingletonOrgId(): Promise<string | null> {
  const db = getDb()
  const rows = await db.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
    take: 2,
  })
  if (rows.length === 1 && rows[0]) return rows[0].id
  return null
}

export async function listDeliveriesForEndpoint(input: {
  endpointId: string
  limit: number
  cursor?: string
}): Promise<DeliveryListRow[]> {
  const db = getDb()
  return db.webhookDelivery.findMany({
    where: { endpointId: input.endpointId },
    orderBy: { createdAt: "desc" },
    take: input.limit,
    skip: input.cursor ? 1 : 0,
    cursor: input.cursor ? { id: input.cursor } : undefined,
    select: {
      id: true,
      endpointId: true,
      eventType: true,
      idempotencyKey: true,
      status: true,
      attempts: true,
      nextAttemptAt: true,
      deliveredAt: true,
      failedAt: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function findDeliveryById(
  id: string,
): Promise<DeliveryWithEndpoint | null> {
  const db = getDb()
  return db.webhookDelivery.findUnique({
    where: { id },
    include: { endpoint: true },
  })
}

export async function listAttemptsForDelivery(
  deliveryId: string,
): Promise<AttemptRow[]> {
  const db = getDb()
  return db.webhookDeliveryAttempt.findMany({
    where: { deliveryId },
    orderBy: { attemptNumber: "asc" },
  })
}

/**
 * Resets a delivery to pending so the next worker tick picks it up.
 * Used by the manual-retry tRPC procedure ; the next attempt fires
 * with attemptNumber preserved so the audit trail remains continuous.
 */
export async function requeueDelivery(
  deliveryId: string,
): Promise<void> {
  const db = getDb()
  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: "pending",
      nextAttemptAt: new Date(),
      failedAt: null,
    },
  })
}
