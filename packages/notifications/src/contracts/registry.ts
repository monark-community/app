import type { NotificationCategory, NotificationChannel } from "@monark/db";
import type { KindMessages } from "../templates/types";

/**
 * Per-kind data shape that callers must pass to `notify()`. Modules
 * extend this map via TypeScript declaration merging :
 *
 * ```ts
 * declare module "@monark/notifications/contracts" {
 *   interface NotificationDataRegistry {
 *     "posts.published": { postId: string; authorId: string }
 *   }
 * }
 * ```
 *
 * Adding an entry here at the type level pairs with a runtime
 * `registerNotificationKind()` call that ships the definition + the
 * template messages. The dispatch path renders the template by
 * interpolating these data values into `{{ var }}` placeholders.
 *
 * Core modules pre-augment this registry below so the existing kinds
 * stay typed without callers doing anything.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface NotificationDataRegistry {}

declare module "./registry" {
  interface NotificationDataRegistry {
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
}

export type NotificationDataMap = NotificationDataRegistry;
export type NotificationKind = keyof NotificationDataMap & string;

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
