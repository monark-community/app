import { z } from "zod"
import { router, publicProcedure } from "@monark/common/trpc"
import {
  emit,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "@monark/common"
import { getDb } from "@monark/db"
import { adminAssignmentSummary } from "@monark/rbac/server"
import {
  getNotificationKindDef,
  listNotificationKindDescriptors,
  type NotificationKind,
} from "../contracts/registry"
import type { NotificationPreferenceChangedEvent } from "../contracts/events"
import { notify } from "./dispatch"
import {
  listPreferences,
  resetPreferences,
  resolveChannelEnabled,
  setPreference,
} from "./prefs"

// Helper that mirrors the rbac.isAdmin gate the /admin layout uses, so a
// non-admin can't reach the admin variants of the preference procedures.
async function requireAdmin(userId: string | null): Promise<string> {
  if (!userId) throw new UnauthorizedError()
  const summary = await adminAssignmentSummary(userId)
  if (!summary.hasAdmin) throw new ForbiddenError("Admin role required.")
  return userId
}

// Resolves the prefs matrix for any userId (admin variants reuse this
// against the target user, self-service uses it against ctx.userId).
//
// Phase-1 only ships SECURITY + ACCOUNT category notifications ;
// ACTIVITY + DIGEST stay in the Prisma enum (reserved for phase-2)
// but we don't surface them here so the prefs UI doesn't render
// empty rows for categories with no live kinds.
async function resolvePrefsCells(userId: string) {
  const rows = await listPreferences(userId)
  const cells: Array<{
    category: "SECURITY" | "ACCOUNT"
    channel: "IN_APP" | "EMAIL"
    enabled: boolean
    forced: boolean
  }> = []
  const categories = ["SECURITY", "ACCOUNT"] as const
  const channels = ["IN_APP", "EMAIL"] as const
  const descriptors = listNotificationKindDescriptors()
  for (const category of categories) {
    for (const channel of channels) {
      const sample = descriptors.find((d) => d.category === category)
      if (!sample) continue
      const enabled = resolveChannelEnabled({
        kind: sample.kind as never,
        channel,
        rows,
      })
      const forced = sample.requiredEmail && channel === "EMAIL"
      cells.push({ category, channel, enabled, forced })
    }
  }
  return cells
}

const channelSchema = z.enum(["IN_APP", "EMAIL"])
// Phase-1 only allows toggling SECURITY + ACCOUNT prefs ; ACTIVITY +
// DIGEST stay in the Prisma enum but the prefs API rejects them so a
// stale client (or someone hand-crafting a request) can't write a
// row that the UI then can't reach.
const categorySchema = z.enum(["SECURITY", "ACCOUNT"])

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  filter: z.enum(["all", "unread"]).optional(),
})

const PAGE_DEFAULT = 20

export const notificationsRouter = router({
  // Unread badge count for the header bell. Cheap ; bounded indexed query.
  unreadCount: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return { count: 0 }
    const db = getDb()
    const count = await db.notification.count({
      where: {
        userId: ctx.userId,
        channel: "IN_APP",
        readAt: null,
        dismissedAt: null,
      },
    })
    return { count }
  }),

  list: publicProcedure.input(listInput).query(async ({ ctx, input }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    const db = getDb()
    const limit = input.limit ?? PAGE_DEFAULT
    const items = await db.notification.findMany({
      where: {
        userId: ctx.userId,
        channel: "IN_APP",
        dismissedAt: null,
        ...(input.filter === "unread" ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        kind: true,
        category: true,
        subject: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
    })
    const hasMore = items.length > limit
    const trimmed = hasMore ? items.slice(0, limit) : items
    return {
      items: trimmed,
      nextCursor: hasMore ? trimmed[trimmed.length - 1]!.id : null,
    }
  }),

  markRead: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const db = getDb()
      await db.notification.updateMany({
        where: { id: input.id, userId: ctx.userId, readAt: null },
        data: { readAt: new Date() },
      })
    }),

  // Toggle a notification back to unread. Useful when the user
  // accidentally marks-read or wants to flag a row to come back to.
  // The underlying `readAt` column is non-null when read ; clearing it
  // re-includes the row in the unread filter + bumps the badge count.
  markUnread: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const db = getDb()
      await db.notification.updateMany({
        where: { id: input.id, userId: ctx.userId, readAt: { not: null } },
        data: { readAt: null },
      })
    }),

  markAllRead: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    const db = getDb()
    const result = await db.notification.updateMany({
      where: {
        userId: ctx.userId,
        channel: "IN_APP",
        readAt: null,
      },
      data: { readAt: new Date() },
    })
    return { updated: result.count }
  }),

  dismiss: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const db = getDb()
      await db.notification.updateMany({
        where: { id: input.id, userId: ctx.userId, dismissedAt: null },
        data: { dismissedAt: new Date() },
      })
    }),

  // Returns a fully-resolved per-(category, channel) matrix so the
  // /account prefs UI can render every cell without itself walking
  // the registry. Forced rows (SECURITY × EMAIL when requiredEmail)
  // are flagged so the UI can disable the toggle.
  preferences: router({
    get: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const cells = await resolvePrefsCells(ctx.userId)
      return { cells }
    }),

    set: publicProcedure
      .input(
        z.object({
          category: categorySchema,
          channel: channelSchema,
          enabled: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError()
        const result = await setPreference({
          userId: ctx.userId,
          category: input.category,
          channel: input.channel,
          enabled: input.enabled,
        })
        const event: NotificationPreferenceChangedEvent = {
          type: "notification.preference-changed",
          userId: ctx.userId,
          category: input.category,
          channel: input.channel,
          enabled: result.enabled,
          occurredAt: new Date(),
        }
        await emit(event).catch(() => {})
        return result
      }),

    reset: publicProcedure.mutation(async ({ ctx }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      await resetPreferences(ctx.userId)
    }),

    // Admin variants of the get/set/reset trio above. Same matrix shape
    // as `get` ; same event emission as `set` (the event still carries
    // the *target* user id, not the actor — listeners care about whose
    // prefs changed, the rbac gate above is the audit-trail anchor).
    adminGet: publicProcedure
      .input(z.object({ userId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId)
        const cells = await resolvePrefsCells(input.userId)
        return { cells }
      }),

    adminSet: publicProcedure
      .input(
        z.object({
          userId: z.string().min(1),
          category: categorySchema,
          channel: channelSchema,
          enabled: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId)
        const result = await setPreference({
          userId: input.userId,
          category: input.category,
          channel: input.channel,
          enabled: input.enabled,
        })
        const event: NotificationPreferenceChangedEvent = {
          type: "notification.preference-changed",
          userId: input.userId,
          category: input.category,
          channel: input.channel,
          enabled: result.enabled,
          occurredAt: new Date(),
        }
        await emit(event).catch(() => {})
        return result
      }),

    adminReset: publicProcedure
      .input(z.object({ userId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        await requireAdmin(ctx.userId)
        await resetPreferences(input.userId)
      }),
  }),

  // Dev-only ; mounted unconditionally but the handler 404s in production
  // so the tRPC client surface stays stable across environments. Used by
  // the dev-overlay panel to fire a test notification of any registered
  // kind at the current authenticated user, bypassing prefs to make sure
  // the row + transport land regardless of opt-out state.
  dev: router({
    testSend: publicProcedure
      .input(
        z.object({
          kind: z.string(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (process.env.NODE_ENV === "production") {
          throw new NotFoundError("notifications.dev.testSend", "production")
        }
        if (!ctx.userId) throw new UnauthorizedError()
        const kind = input.kind as NotificationKind
        const def = getNotificationKindDef(kind)
        if (!def) {
          throw new NotFoundError("NotificationKind", input.kind)
        }
        // Synthesise a payload for the kind ; values are illustrative,
        // not load-bearing. Keeps the dev surface dependency-free.
        const now = new Date()
        const payload = (() => {
          switch (kind) {
            case "auth.new-device":
              return {
                deviceLabel: "Chrome on macOS",
                deviceCountry: "Canada",
                deviceIp: "203.0.113.42",
                seenAt: now,
              }
            case "auth.password-changed":
            case "auth.totp-enabled":
            case "auth.totp-disabled":
            case "account.deletion-canceled":
              return { occurredAt: now }
            case "auth.all-devices-revoked":
              return { count: 3, occurredAt: now }
            case "account.email-changed":
              return {
                previousEmail: "old@example.com",
                newEmail: "new@example.com",
                occurredAt: now,
              }
            case "account.deletion-scheduled":
              return {
                completesAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
              }
            case "webhooks.delivery-permanently-failed":
              return {
                endpointId: "wh_test_endpoint",
                endpointUrl: "https://receiver.example/hook",
                eventType: "rbac.role-assigned",
                attempts: 5,
                reason: "HTTP 500",
                scope: "org" as const,
                occurredAt: now,
              }
            case "webhooks.endpoint-auto-disabled":
              return {
                endpointId: "wh_test_endpoint",
                endpointUrl: "https://receiver.example/hook",
                consecutiveFailures: 5,
                scope: "org" as const,
                occurredAt: now,
              }
            default: {
              const _exhaustive: never = kind
              return _exhaustive
            }
          }
        })()
        const result = await notify(
          kind,
          { userId: ctx.userId },
          payload as never,
        )
        return result
      }),

    listKinds: publicProcedure.query(() => {
      if (process.env.NODE_ENV === "production") return { kinds: [] }
      return {
        kinds: listNotificationKindDescriptors().map((d) => ({
          kind: d.kind,
          category: d.category,
          channels: d.channels,
        })),
      }
    }),
  }),
})
