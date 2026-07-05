import authNewDevice from "../templates/auth/new-device";
import authPasswordChanged from "../templates/auth/password-changed";
import authTotpEnabled from "../templates/auth/totp-enabled";
import authTotpDisabled from "../templates/auth/totp-disabled";
import authAllDevicesRevoked from "../templates/auth/all-devices-revoked";
import authSignedIn from "../templates/auth/signed-in";
import authDeviceRevoked from "../templates/auth/device-revoked";
import authRecoveryCodeUsed from "../templates/auth/recovery-code-used";
import authRecoveryCodesRegenerated from "../templates/auth/recovery-codes-regenerated";
import accountEmailChanged from "../templates/account/email-changed";
import accountDeletionScheduled from "../templates/account/deletion-scheduled";
import accountDeletionCanceled from "../templates/account/deletion-canceled";
import webhooksDeliveryPermanentlyFailed from "../templates/webhooks/delivery-permanently-failed";
import webhooksEndpointAutoDisabled from "../templates/webhooks/endpoint-auto-disabled";
import { registerNotificationKind } from "../contracts/registry";

let registered = false;

/**
 * Registers the core notification kinds (auth + account + webhook
 * operator alerts) shipped with the platform : new device, sign-in
 * alert, password changed, TOTP enable / disable, recovery-code used,
 * recovery-codes regenerated, single-device + all-devices revoked,
 * email change receipt, and the two account-deletion lifecycle
 * notices. Idempotent — calling twice is a no-op so the api boot path
 * can re-run on hot reloads.
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

  // Optional per-sign-in alert. Email-only + default-OFF : most users
  // rely on `auth.new-device` (which only fires for unrecognised
  // devices) ; this is the opt-in "email me every single sign-in" knob
  // for the security-conscious. No IN_APP channel — a bell entry per
  // login would drown the feed.
  registerNotificationKind(
    "auth.signed-in",
    {
      category: "SECURITY",
      channels: ["EMAIL"],
      defaultEnabled: { EMAIL: false },
      requiredEmail: false,
      template: "auth/signed-in",
    },
    authSignedIn,
  );

  // Single-device sign-out receipt. Complements `auth.all-devices-revoked`
  // (the bulk "panic" sweep) ; the subscriber skips the per-device event
  // when it's part of a bulk revoke so the user gets one email, not N.
  // Opt-out-able — not every user wants a receipt for routine session
  // management.
  registerNotificationKind(
    "auth.device-revoked",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: false,
      template: "auth/device-revoked",
    },
    authDeviceRevoked,
  );

  // A two-factor recovery code was consumed. requiredEmail because a
  // recovery-code sign-in bypasses the authenticator, so an attacker who
  // obtained a code could otherwise silence the one signal that would
  // tip off the legitimate owner.
  registerNotificationKind(
    "auth.recovery-code-used",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: true,
      template: "auth/recovery-code-used",
    },
    authRecoveryCodeUsed,
  );

  // The user's backup codes were regenerated (old codes invalidated).
  // requiredEmail : regenerating codes is a credential-management action
  // an account owner must always be told about, since it changes the
  // account-recovery surface.
  registerNotificationKind(
    "auth.recovery-codes-regenerated",
    {
      category: "SECURITY",
      channels: ["EMAIL", "IN_APP"],
      defaultEnabled: { EMAIL: true, IN_APP: true },
      requiredEmail: true,
      template: "auth/recovery-codes-regenerated",
    },
    authRecoveryCodesRegenerated,
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
