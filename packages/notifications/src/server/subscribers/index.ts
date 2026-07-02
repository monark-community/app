import { brandingTemplateVars } from "@monark/branding";
import { logger, on } from "@monark/common";
import { getDb } from "@monark/db";
import { mintEmailActionToken } from "@monark/auth/server";
import type {
  PasswordChangedEvent,
  TotpDisabledEvent,
  TotpEnabledEvent,
  TrustedDeviceAddedEvent,
  TrustedDevicesAllRevokedEvent,
} from "@monark/auth/contracts";
import { listOrgAdminUserIds, listSysadminUserIds } from "@monark/rbac/server";
import type {
  UserDeletionCanceledEvent,
  UserDeletionRequestedEvent,
  UserEmailChangedEvent,
} from "@monark/users/contracts";
import type {
  WebhookDeliveryFailedEvent,
  WebhookEndpointDisabledEvent,
} from "@monark/webhooks/contracts";
import { notify } from "../dispatch";

let registered = false;

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
  if (registered) return;
  registered = true;

  on<TrustedDeviceAddedEvent>("trusted-device.added", async (event) => {
    try {
      const db = getDb();
      const device = await db.trustedDevice.findUnique({
        where: { id: event.deviceId },
        select: {
          label: true,
          lastSeenIp: true,
          country: true,
          lastSeenAt: true,
        },
      });
      if (!device) return;
      // Mint a per-device HMAC token + build the one-click revoke URL
      // the email's CTA links to. Token carries userId + deviceId +
      // 7-day expiry ; clicking lands on /auth/revoke-device/<token>
      // which calls auth.trustedDevices.revokeByEmailToken without a
      // session round-trip. `APP_URL` is preferred over the branding
      // default so per-deployment overrides (preview branches,
      // staging) build the right hostname.
      const appUrl = (process.env.APP_URL ?? brandingTemplateVars().appUrl).replace(/\/$/, "");
      const token = mintEmailActionToken({
        purpose: "revoke-device",
        userId: event.userId,
        deviceId: event.deviceId,
      });
      const revokeLink = `${appUrl}/auth/revoke-device/${token}`;
      await notify(
        "auth.new-device",
        { userId: event.userId },
        {
          deviceLabel: device.label,
          deviceCountry: device.country,
          deviceIp: device.lastSeenIp,
          seenAt: device.lastSeenAt,
          revokeLink,
        },
      );
    } catch (err) {
      logger.error({ err, event }, "auth.new-device subscriber failed");
    }
  });

  on<PasswordChangedEvent>("user.password-changed", async (event) => {
    try {
      await notify(
        "auth.password-changed",
        { userId: event.userId },
        {
          occurredAt: event.occurredAt,
        },
      );
    } catch (err) {
      logger.error({ err, event }, "auth.password-changed subscriber failed");
    }
  });

  on<TotpEnabledEvent>("totp.enabled", async (event) => {
    try {
      await notify(
        "auth.totp-enabled",
        { userId: event.userId },
        {
          occurredAt: event.occurredAt,
        },
      );
    } catch (err) {
      logger.error({ err, event }, "auth.totp-enabled subscriber failed");
    }
  });

  on<TotpDisabledEvent>("totp.disabled", async (event) => {
    try {
      await notify(
        "auth.totp-disabled",
        { userId: event.userId },
        {
          occurredAt: event.occurredAt,
        },
      );
    } catch (err) {
      logger.error({ err, event }, "auth.totp-disabled subscriber failed");
    }
  });

  on<TrustedDevicesAllRevokedEvent>("trusted-devices.all-revoked", async (event) => {
    try {
      await notify(
        "auth.all-devices-revoked",
        { userId: event.userId },
        {
          count: event.count,
          occurredAt: event.occurredAt,
        },
      );
    } catch (err) {
      logger.error({ err, event }, "auth.all-devices-revoked subscriber failed");
    }
  });

  on<UserEmailChangedEvent>("user.email-changed", async (event) => {
    try {
      await notify(
        "account.email-changed",
        { userId: event.userId },
        {
          previousEmail: event.previousEmail,
          newEmail: event.newEmail,
          occurredAt: event.occurredAt,
        },
      );
    } catch (err) {
      logger.error({ err, event }, "account.email-changed subscriber failed");
    }
  });

  on<UserDeletionRequestedEvent>("user.deletion-requested", async (event) => {
    try {
      await notify(
        "account.deletion-scheduled",
        { userId: event.userId },
        {
          completesAt: event.deletionCompletesAt,
        },
      );
    } catch (err) {
      logger.error({ err, event }, "account.deletion-scheduled subscriber failed");
    }
  });

  on<UserDeletionCanceledEvent>("user.deletion-canceled", async (event) => {
    try {
      await notify(
        "account.deletion-canceled",
        { userId: event.userId },
        {
          occurredAt: event.occurredAt,
        },
      );
    } catch (err) {
      logger.error({ err, event }, "account.deletion-canceled subscriber failed");
    }
  });

  // ── Webhook operator alerts ─────────────────────────────────────
  // Two notifications, both fanned out to the right operator group :
  //
  //   - On a *permanent* delivery failure (retries exhausted, the
  //     `permanent: true` branch of the worker), tell every org admin
  //     (org-scoped endpoint) or every sysadmin (platform-tier
  //     endpoint) so they can investigate. Skipped on retry-able
  //     failures to avoid spamming the inbox during a transient
  //     receiver outage.
  //   - On endpoint auto-disable (5 consecutive failures hit the
  //     limit), the same fan-out plus `requiredEmail` since this is
  //     the actionable "your endpoint is dead" signal.
  //
  // The fan-out helpers (`listOrgAdminUserIds` / `listSysadminUserIds`)
  // are bounded by the number of admins per org ; for a small team
  // this is a handful of users, so per-recipient `notify()` calls
  // stay cheap. The dispatcher's 60s dedupe window absorbs simultaneous
  // failures of distinct deliveries to the same endpoint.
  on<WebhookDeliveryFailedEvent>("webhook.delivery-failed", async (event) => {
    if (!event.permanent) return;
    try {
      const recipients = await resolveWebhookOperators(event.organizationId);
      const scope = event.organizationId === null ? "platform" : "org";
      for (const userId of recipients) {
        await notify(
          "webhooks.delivery-permanently-failed",
          { userId },
          {
            endpointId: event.endpointId,
            endpointUrl: event.endpointUrl,
            eventType: event.eventType,
            attempts: event.attemptNumber,
            reason: event.reason,
            scope,
            occurredAt: event.occurredAt,
          },
        );
      }
    } catch (err) {
      logger.error({ err, event }, "webhooks.delivery-permanently-failed subscriber failed");
    }
  });

  on<WebhookEndpointDisabledEvent>("webhook.endpoint-disabled-after-failures", async (event) => {
    try {
      const recipients = await resolveWebhookOperators(event.organizationId);
      const scope = event.organizationId === null ? "platform" : "org";
      for (const userId of recipients) {
        await notify(
          "webhooks.endpoint-auto-disabled",
          { userId },
          {
            endpointId: event.endpointId,
            endpointUrl: await resolveEndpointUrl(event.endpointId),
            consecutiveFailures: event.consecutiveFailures,
            scope,
            occurredAt: event.occurredAt,
          },
        );
      }
    } catch (err) {
      logger.error({ err, event }, "webhooks.endpoint-auto-disabled subscriber failed");
    }
  });
}

/**
 * Resolves the operator group that should receive an alert about a
 * webhook endpoint :
 *
 *   - Org-scoped endpoint ⇒ active org admins (built-in `ADMIN` role).
 *   - Platform-tier endpoint ⇒ active sysadmins.
 *
 * Returns user ids ; the caller hydrates with `notify(...)` per
 * recipient. Empty list is a valid outcome when an org has no admins
 * (e.g. the last admin was removed) — the alert is dropped silently
 * since there's no one to notify.
 */
async function resolveWebhookOperators(organizationId: string | null): Promise<string[]> {
  if (organizationId === null) {
    return listSysadminUserIds();
  }
  return listOrgAdminUserIds(organizationId);
}

/**
 * The auto-disable event doesn't carry the endpoint URL because it
 * was added to delivery events but not to the disable event (the
 * disable path runs after `markDeliveryFailed` from inside the
 * worker, after the URL is no longer in scope). Looking it up from
 * the row here keeps the event payload tight.
 */
async function resolveEndpointUrl(endpointId: string): Promise<string> {
  const db = getDb();
  const row = await db.webhookEndpoint.findUnique({
    where: { id: endpointId },
    select: { url: true },
  });
  return row?.url ?? "(deleted endpoint)";
}

/**
 * Resets the idempotency flag so the integration suite can re-bind
 * subscribers in `beforeEach`. Production callers never need this —
 * `registerNotificationSubscribers()` is invoked once at api boot
 * and is no-op on subsequent calls.
 */
export function _resetSubscribersForTesting(): void {
  registered = false;
}
