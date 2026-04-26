import { logger, on } from "@monark/common"
import { getDb } from "@monark/db"
import type { TrustedDeviceAddedEvent } from "../contracts/events"
import { sendMail } from "./mailer"

let registered = false

// Subscribes to `trusted-device.added` and emails the user a heads-up.
// Idempotent across calls — the listener is registered exactly once even
// if the api process imports this module multiple times in dev hot-reload.
export function registerNewDeviceEmailListener(): void {
  if (registered) return
  registered = true
  on<TrustedDeviceAddedEvent>("trusted-device.added", async (event) => {
    try {
      const db = getDb()
      const [user, device] = await Promise.all([
        db.user.findUnique({
          where: { id: event.userId },
          select: { email: true },
        }),
        db.trustedDevice.findUnique({
          where: { id: event.deviceId },
          select: { label: true, lastSeenIp: true, country: true, lastSeenAt: true },
        }),
      ])
      if (!user?.email || !device) return

      const where = [device.country, device.lastSeenIp].filter(Boolean).join(" · ")
      const at = device.lastSeenAt.toISOString().replace("T", " ").slice(0, 16)
      const appUrl = process.env.APP_URL ?? "http://localhost:3000"
      const revokeLink = `${appUrl}/account?tab=security`

      await sendMail({
        to: user.email,
        subject: "New sign-in on Monark",
        text: [
          `We noticed a new sign-in on Monark.`,
          ``,
          `Device: ${device.label}`,
          where ? `Where: ${where}` : null,
          `When:  ${at} UTC`,
          ``,
          `If that wasn't you, revoke the device immediately:`,
          revokeLink,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      })
    } catch (err) {
      logger.error({ err, event }, "new-device email handler failed")
    }
  })
}
