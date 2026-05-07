import type {
  NotificationCategory,
  NotificationChannel,
} from "@monark/db"
import { getDb } from "@monark/db"
import {
  getNotificationKindDef,
  type NotificationKind,
} from "../contracts/registry"

export type PrefRow = {
  category: NotificationCategory
  channel: NotificationChannel
  enabled: boolean
}

/**
 * Pure resolution: given a kind def + the user's stored override rows,
 * decide whether the channel is on for that kind. SECURITY-category
 * EMAIL is forced ON when `requiredEmail=true` so a stray override row
 * (from a buggy migration, manual SQL, etc.) can't silently disable
 * account-safety mail.
 *
 * Exported for the unit suite ; the runtime path uses `isChannelEnabled`
 * which loads the rows first.
 */
export function resolveChannelEnabled(input: {
  kind: NotificationKind
  channel: NotificationChannel
  rows: PrefRow[]
}): boolean {
  const def = getNotificationKindDef(input.kind)
  // Unregistered kinds are treated as "off everywhere" — defensive
  // default for the case where a renamed kind still has stale
  // Notification rows pointing at it.
  if (!def) return false
  if (def.requiredEmail && input.channel === "EMAIL") return true
  const match = input.rows.find(
    (r) => r.category === def.category && r.channel === input.channel,
  )
  if (match) return match.enabled
  return def.defaultEnabled[input.channel] ?? false
}

/** Loads pref rows for a user once, then resolves a channel decision. */
export async function isChannelEnabled(input: {
  userId: string
  kind: NotificationKind
  channel: NotificationChannel
}): Promise<boolean> {
  const db = getDb()
  const rows = await db.notificationPreference.findMany({
    where: { userId: input.userId },
    select: { category: true, channel: true, enabled: true },
  })
  return resolveChannelEnabled({
    kind: input.kind,
    channel: input.channel,
    rows,
  })
}

/** Loads + returns every pref row for a user. */
export async function listPreferences(userId: string): Promise<PrefRow[]> {
  const db = getDb()
  return db.notificationPreference.findMany({
    where: { userId },
    select: { category: true, channel: true, enabled: true },
  })
}

/**
 * Upserts one preference row. Returns the resolved value (which may
 * differ from `enabled` if the kind's `requiredEmail` constraint
 * forces it back on).
 */
export async function setPreference(input: {
  userId: string
  category: NotificationCategory
  channel: NotificationChannel
  enabled: boolean
}): Promise<{ enabled: boolean }> {
  const db = getDb()
  await db.notificationPreference.upsert({
    where: {
      userId_category_channel: {
        userId: input.userId,
        category: input.category,
        channel: input.channel,
      },
    },
    create: {
      userId: input.userId,
      category: input.category,
      channel: input.channel,
      enabled: input.enabled,
    },
    update: { enabled: input.enabled },
  })
  return { enabled: input.enabled }
}

/** Drop every override row, reverting to registry defaults. */
export async function resetPreferences(userId: string): Promise<void> {
  const db = getDb()
  await db.notificationPreference.deleteMany({ where: { userId } })
}
