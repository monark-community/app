import { logger, on } from "@monark/common"
import { getDb } from "@monark/db"
import type {
  PasswordChangedEvent,
  TotpDisabledEvent,
  TotpEnabledEvent,
  TrustedDeviceAddedEvent,
  TrustedDevicesAllRevokedEvent,
} from "@monark/auth/contracts"
import type {
  UserDeletionCanceledEvent,
  UserDeletionRequestedEvent,
  UserEmailChangedEvent,
} from "@monark/users/contracts"
import { notify } from "../dispatch"

let registered = false

/**
 * Idempotent subscriber registration. Bind once at api boot. Each
 * handler does its own per-event DB joins (where needed) before
 * forwarding the data shape declared in the registry to `notify()`.
 *
 * Errors inside a handler are logged but not re-raised ; subscribers
 * are best-effort consumers of an event the producer has already
 * committed.
 */
export function registerNotificationSubscribers(): void {
  if (registered) return
  registered = true

  on<TrustedDeviceAddedEvent>("trusted-device.added", async (event) => {
    try {
      const db = getDb()
      const device = await db.trustedDevice.findUnique({
        where: { id: event.deviceId },
        select: {
          label: true,
          lastSeenIp: true,
          country: true,
          lastSeenAt: true,
        },
      })
      if (!device) return
      await notify("auth.new-device", { userId: event.userId }, {
        deviceLabel: device.label,
        deviceCountry: device.country,
        deviceIp: device.lastSeenIp,
        seenAt: device.lastSeenAt,
      })
    } catch (err) {
      logger.error({ err, event }, "auth.new-device subscriber failed")
    }
  })

  on<PasswordChangedEvent>("user.password-changed", async (event) => {
    try {
      await notify("auth.password-changed", { userId: event.userId }, {
        occurredAt: event.occurredAt,
      })
    } catch (err) {
      logger.error({ err, event }, "auth.password-changed subscriber failed")
    }
  })

  on<TotpEnabledEvent>("totp.enabled", async (event) => {
    try {
      await notify("auth.totp-enabled", { userId: event.userId }, {
        occurredAt: event.occurredAt,
      })
    } catch (err) {
      logger.error({ err, event }, "auth.totp-enabled subscriber failed")
    }
  })

  on<TotpDisabledEvent>("totp.disabled", async (event) => {
    try {
      await notify("auth.totp-disabled", { userId: event.userId }, {
        occurredAt: event.occurredAt,
      })
    } catch (err) {
      logger.error({ err, event }, "auth.totp-disabled subscriber failed")
    }
  })

  on<TrustedDevicesAllRevokedEvent>("trusted-devices.all-revoked", async (event) => {
    try {
      await notify("auth.all-devices-revoked", { userId: event.userId }, {
        count: event.count,
        occurredAt: event.occurredAt,
      })
    } catch (err) {
      logger.error({ err, event }, "auth.all-devices-revoked subscriber failed")
    }
  })

  on<UserEmailChangedEvent>("user.email-changed", async (event) => {
    try {
      await notify("account.email-changed", { userId: event.userId }, {
        previousEmail: event.previousEmail,
        newEmail: event.newEmail,
        occurredAt: event.occurredAt,
      })
    } catch (err) {
      logger.error({ err, event }, "account.email-changed subscriber failed")
    }
  })

  on<UserDeletionRequestedEvent>("user.deletion-requested", async (event) => {
    try {
      await notify("account.deletion-scheduled", { userId: event.userId }, {
        completesAt: event.deletionCompletesAt,
      })
    } catch (err) {
      logger.error({ err, event }, "account.deletion-scheduled subscriber failed")
    }
  })

  on<UserDeletionCanceledEvent>("user.deletion-canceled", async (event) => {
    try {
      await notify("account.deletion-canceled", { userId: event.userId }, {
        occurredAt: event.occurredAt,
      })
    } catch (err) {
      logger.error({ err, event }, "account.deletion-canceled subscriber failed")
    }
  })
}
