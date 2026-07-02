import authNewDevice from "../templates/auth/new-device";
import authPasswordChanged from "../templates/auth/password-changed";
import authTotpEnabled from "../templates/auth/totp-enabled";
import authTotpDisabled from "../templates/auth/totp-disabled";
import authAllDevicesRevoked from "../templates/auth/all-devices-revoked";
import accountEmailChanged from "../templates/account/email-changed";
import accountDeletionScheduled from "../templates/account/deletion-scheduled";
import accountDeletionCanceled from "../templates/account/deletion-canceled";
import webhooksDeliveryPermanentlyFailed from "../templates/webhooks/delivery-permanently-failed";
import webhooksEndpointAutoDisabled from "../templates/webhooks/endpoint-auto-disabled";
import { registerNotificationKind } from "../contracts/registry";

let registered = false;

/**
 * Registers the eight core notification kinds (auth + account)
 * shipped with the platform : new device, password changed, TOTP
 * enable / disable, all-devices revoked, email change receipt, and
 * the two account-deletion lifecycle notices. Idempotent — calling
 * twice is a no-op so the api boot path can re-run on hot reloads.
 *
 * Extended modules add their own kinds by calling
 * `registerNotificationKind(kind, def, messages)` directly from their
 * own `register<Module>NotificationKinds()` helper.
 */
export function registerCoreNotificationKinds(): void {
  if (registered) return;
  registered = true;

  registerNotificationKind(
    "auth.new-device",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: true,
      template: "auth/new-device",
    },
    authNewDevice,
  );

  registerNotificationKind(
    "auth.password-changed",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: true,
      template: "auth/password-changed",
    },
    authPasswordChanged,
  );

  registerNotificationKind(
    "auth.totp-enabled",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: true,
      template: "auth/totp-enabled",
    },
    authTotpEnabled,
  );

  registerNotificationKind(
    "auth.totp-disabled",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: true,
      template: "auth/totp-disabled",
    },
    authTotpDisabled,
  );

  registerNotificationKind(
    "auth.all-devices-revoked",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: true,
      template: "auth/all-devices-revoked",
    },
    authAllDevicesRevoked,
  );

  registerNotificationKind(
    "account.email-changed",
    {
      category: "ACCOUNT",
      channels: ["IN_APP"],
      defaultEnabled: { IN_APP: true },
      // Supabase already mails both addresses for the change ; we
      // only post an in-app receipt so the user has a history entry.
      requiredEmail: false,
      template: "account/email-changed",
    },
    accountEmailChanged,
  );

  registerNotificationKind(
    "account.deletion-scheduled",
    {
      category: "ACCOUNT",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: false,
      template: "account/deletion-scheduled",
    },
    accountDeletionScheduled,
  );

  registerNotificationKind(
    "account.deletion-canceled",
    {
      category: "ACCOUNT",
      channels: ["IN_APP"],
      defaultEnabled: { IN_APP: true },
      requiredEmail: false,
      template: "account/deletion-canceled",
    },
    accountDeletionCanceled,
  );

  // Webhook operator alerts. SECURITY-category because they're
  // infrastructure-integrity signals an operator never wants to miss
  // — same family as `auth.password-changed` from the operator's
  // POV. The auto-disable kind is required-email so an admin who's
  // opted out of every other notification still gets the
  // "your endpoint is dead" alert. The per-permanent-failure kind
  // ships default-on but operators can opt out via the prefs UI ;
  // a flapping receiver could otherwise spam the inbox.
  registerNotificationKind(
    "webhooks.delivery-permanently-failed",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: false,
      template: "webhooks/delivery-permanently-failed",
    },
    webhooksDeliveryPermanentlyFailed,
  );

  registerNotificationKind(
    "webhooks.endpoint-auto-disabled",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: true,
      template: "webhooks/endpoint-auto-disabled",
    },
    webhooksEndpointAutoDisabled,
  );
}

export function _resetCoreKindsRegisteredForTesting(): void {
  registered = false;
}
