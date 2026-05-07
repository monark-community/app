import type { NotificationCategory, NotificationChannel } from "@monark/db"

/**
 * Per-kind data shape that callers must pass to `notify()`. The shape is
 * what the template renderer can interpolate (`{{ deviceLabel }}`,
 * `{{ completesAt }}`, …). Adding a kind below requires adding the
 * matching template files under `src/templates/<path>/{en,fr}.{html,txt,inapp.json}`.
 *
 * Pure data ; safe to import from any tier.
 */
export type NotificationDataMap = {
  "auth.new-device": {
    deviceLabel: string
    deviceCountry: string | null
    deviceIp: string | null
    seenAt: Date
  }
  "auth.password-changed": {
    occurredAt: Date
  }
  "auth.totp-enabled": {
    occurredAt: Date
  }
  "auth.totp-disabled": {
    occurredAt: Date
  }
  "auth.all-devices-revoked": {
    count: number
    occurredAt: Date
  }
  "account.email-changed": {
    previousEmail: string
    newEmail: string
    occurredAt: Date
  }
  "account.deletion-scheduled": {
    completesAt: Date
  }
  "account.deletion-canceled": {
    occurredAt: Date
  }
}

export type NotificationKind = keyof NotificationDataMap

export type NotificationKindDef = {
  category: NotificationCategory
  /** Channels this kind delivers to. Order is *not* meaningful. */
  channels: NotificationChannel[]
  /** Per-channel default ; consulted when no explicit pref row exists. */
  defaultEnabled: Partial<Record<NotificationChannel, boolean>>
  /**
   * When true, EMAIL channel for this kind cannot be opted out of (the
   * prefs UI shows a disabled toggle). Account-safety guarantee for
   * SECURITY-category kinds ; ignored for other categories.
   */
  requiredEmail: boolean
  /**
   * Resolves to `src/templates/<template>/{locale}.{html|txt|inapp.json}`.
   */
  template: string
}

export const NOTIFICATION_KINDS: Record<NotificationKind, NotificationKindDef> = {
  "auth.new-device": {
    category: "SECURITY",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: true,
    template: "auth/new-device",
  },
  "auth.password-changed": {
    category: "SECURITY",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: true,
    template: "auth/password-changed",
  },
  "auth.totp-enabled": {
    category: "SECURITY",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: true,
    template: "auth/totp-enabled",
  },
  "auth.totp-disabled": {
    category: "SECURITY",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: true,
    template: "auth/totp-disabled",
  },
  "auth.all-devices-revoked": {
    category: "SECURITY",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: true,
    template: "auth/all-devices-revoked",
  },
  "account.email-changed": {
    category: "ACCOUNT",
    channels: ["IN_APP"],
    defaultEnabled: { IN_APP: true },
    // Supabase already mails both addresses for the change ; we only post
    // an in-app receipt so the user has a history entry.
    requiredEmail: false,
    template: "account/email-changed",
  },
  "account.deletion-scheduled": {
    category: "ACCOUNT",
    channels: ["EMAIL", "IN_APP"],
    defaultEnabled: { EMAIL: true, IN_APP: true },
    requiredEmail: false,
    template: "account/deletion-scheduled",
  },
  "account.deletion-canceled": {
    category: "ACCOUNT",
    channels: ["IN_APP"],
    defaultEnabled: { IN_APP: true },
    requiredEmail: false,
    template: "account/deletion-canceled",
  },
}

export function isKnownNotificationKind(value: string): value is NotificationKind {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_KINDS, value)
}

export function listNotificationKinds(): NotificationKind[] {
  return Object.keys(NOTIFICATION_KINDS) as NotificationKind[]
}
