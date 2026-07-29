import type { NotificationCategory, NotificationChannel } from "@monark/db";
import type { KindMessages } from "../templates/types";
import type { NotificationKind } from "./index";

/**
 * The notification kinds this package ships. Declared as a plain interface (not
 * a `declare module` self-augmentation) ; the augmentable public registry
 * {@link NotificationDataRegistry} — declared in `./index`, the module the
 * `@monark/notifications/contracts` specifier resolves to — `extends` this.
 *
 * Extended modules add their own kinds by augmenting that public entry :
 *
 * ```ts
 * declare module "@monark/notifications/contracts" {
 *   interface NotificationDataRegistry {
 *     "posts.published": { postId: string; authorId: string };
 *   }
 * }
 * ```
 *
 * The augmentation MUST target the entry that *declares* the interface (index),
 * which is exactly what `@monark/notifications/contracts` resolves to — an
 * augmentation aimed at a file that only *re-exports* the interface silently
 * fails to merge. Each type-level entry pairs with a runtime
 * `registerNotificationKind()` call that ships the def + template messages.
 */
export interface CoreNotificationKinds {
  "auth.new-device": {
    deviceLabel: string;
    deviceCountry: string | null;
    deviceIp: string | null;
    seenAt: Date;
    // Per-device one-click revoke URL minted by the subscriber from
    // an HMAC-signed token (see `@monark/auth/server`
    // `mintEmailActionToken`). Overrides the generic
    // `${appUrl}/account/security` `revokeLink` injected by
    // `globalVars()` so the new-device email lands directly on a
    // confirmation page that revokes the device with a single click
    // ; clicking from a different device works because the token
    // carries the userId + deviceId itself.
    revokeLink: string;
  };
  "auth.password-changed": {
    occurredAt: Date;
  };
  "auth.totp-enabled": {
    occurredAt: Date;
  };
  "auth.totp-disabled": {
    occurredAt: Date;
  };
  "auth.all-devices-revoked": {
    count: number;
    occurredAt: Date;
  };
  "auth.signed-in": {
    // Best-effort device label ; null when the sign-in wasn't tied to a
    // recognised trusted device (enrich falls it back to a locale string).
    deviceLabel: string | null;
    occurredAt: Date;
  };
  "auth.device-revoked": {
    deviceLabel: string | null;
    occurredAt: Date;
  };
  "auth.recovery-code-used": {
    remainingCodes: number;
    occurredAt: Date;
  };
  "auth.recovery-codes-regenerated": {
    count: number;
    occurredAt: Date;
  };
  "account.email-changed": {
    previousEmail: string;
    newEmail: string;
    occurredAt: Date;
  };
  "account.deletion-scheduled": {
    completesAt: Date;
  };
  "account.deletion-canceled": {
    occurredAt: Date;
  };
  "webhooks.delivery-permanently-failed": {
    endpointId: string;
    endpointUrl: string;
    eventType: string;
    attempts: number;
    reason: string;
    scope: "org" | "platform";
    occurredAt: Date;
  };
  "webhooks.endpoint-auto-disabled": {
    endpointId: string;
    endpointUrl: string;
    consecutiveFailures: number;
    scope: "org" | "platform";
    occurredAt: Date;
  };
}

export type NotificationKindDef = {
  category: NotificationCategory;
  /** Channels this kind delivers to. Order is *not* meaningful. */
  channels: NotificationChannel[];
  /** Per-channel default ; consulted when no explicit pref row exists. */
  defaultEnabled: Partial<Record<NotificationChannel, boolean>>;
  /**
   * When true, EMAIL channel for this kind cannot be opted out of (the
   * prefs UI shows a disabled toggle). Account-safety guarantee for
   * SECURITY-category kinds ; ignored for other categories.
   */
  requiredEmail: boolean;
  /**
   * Stable template id (e.g. `auth/new-device`). Only used as the
   * runtime registry key ; the actual messages are stored alongside
   * the def via `registerNotificationKind()`.
   */
  template: string;
};

const definitions = new Map<string, NotificationKindDef>();
const templates = new Map<string, KindMessages>();

/**
 * Register a notification kind + its localized templates. Idempotent
 * by `kind` ; a re-register replaces the previous entry. Called once
 * at api boot for every kind the deploy supports — core kinds via
 * `registerCoreNotificationKinds()`, extended modules via their own
 * `register<Module>NotificationKinds()` helpers.
 */
export function registerNotificationKind(
  kind: string,
  def: NotificationKindDef,
  messages: KindMessages,
): void {
  definitions.set(kind, def);
  templates.set(def.template, messages);
}

export function getNotificationKindDef(kind: string): NotificationKindDef | undefined {
  return definitions.get(kind);
}

export function getNotificationTemplate(templateId: string): KindMessages | undefined {
  return templates.get(templateId);
}

export function isKnownNotificationKind(value: string): value is NotificationKind {
  return definitions.has(value);
}

export function listNotificationKinds(): NotificationKind[] {
  return [...definitions.keys()] as NotificationKind[];
}

export function listNotificationKindDescriptors(): Array<{ kind: string } & NotificationKindDef> {
  return [...definitions.entries()].map(([kind, def]) => ({ kind, ...def }));
}

export function _resetNotificationRegistryForTesting(): void {
  definitions.clear();
  templates.clear();
}
