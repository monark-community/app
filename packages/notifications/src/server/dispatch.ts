import { createHash } from "node:crypto";
import { emit, logger } from "@monark/common";
import { getDb, type NotificationChannel } from "@monark/db";
import {
  getNotificationKindDef,
  getNotificationTemplate,
  type NotificationDataMap,
  type NotificationKind,
} from "../contracts";
import type {
  NotificationCreatedEvent,
  NotificationDeliveryFailedEvent,
} from "../contracts/events";
import { isChannelEnabled } from "./prefs";
import { sendMail } from "./transport/email";
import { enrichVars, resolveOrgBranding } from "./enrich";
import { renderString } from "./template";
import { EMAIL_SHELL } from "../templates";

const DEDUPE_WINDOW_MS = 60_000;

export type DispatchResult = {
  /** IDs of Notification rows persisted (one per channel actually delivered to). */
  deliveryIds: string[];
  /** Channels skipped because the user opted out, with the reason. */
  skipped: Array<{ channel: NotificationChannel; reason: string }>;
};

/**
 * Single-recipient dispatch. Resolves the recipient's prefs + locale +
 * email, renders the template per enabled channel, persists Notification
 * rows, triggers transports, and emits domain events. Never throws ;
 * failures are recorded on the row + emitted as `notification.delivery-failed`
 * so the calling action (sign-in, password change, …) is not rolled back
 * by a notification problem.
 */
export async function notify<K extends NotificationKind>(
  kind: K,
  recipient: { userId: string },
  data: NotificationDataMap[K],
): Promise<DispatchResult> {
  const db = getDb();
  const def = getNotificationKindDef(kind);
  const result: DispatchResult = { deliveryIds: [], skipped: [] };
  if (!def) {
    logger.error(
      { kind },
      "notify: kind not registered ; ensure registerCoreNotificationKinds() / register<Module>NotificationKinds() ran at boot",
    );
    return result;
  }

  const user = await db.user
    .findUnique({
      where: { id: recipient.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        localePreference: true,
        deletedAt: true,
        kind: true,
      },
    })
    .catch((err) => {
      logger.error({ err, userId: recipient.userId, kind }, "notify: user lookup failed");
      return null;
    });
  if (!user) {
    logger.warn({ userId: recipient.userId, kind }, "notify: recipient not found, skipping");
    return result;
  }
  // Service accounts are machine principals : no inbox, no in-app surface, no
  // opt-in preferences. Never dispatch anything to one.
  if (user.kind === "SERVICE") {
    return result;
  }

  const locale = user.localePreference === "fr" ? "fr" : "en";
  const dedupeKey = computeDedupeKey(data);
  // Pull the singleton org's brand overrides (logo + primary color)
  // so the email shell renders the deployer's actual brand instead of
  // the starter-template `BRANDING.logoSrc` from /public and the
  // starter-orange accent bar. Returns nulls for multi-tenant or when
  // the org row has neither field configured ; `enrichVars` falls
  // back to BRANDING for any null.
  const orgBranding = await resolveOrgBranding();
  const vars = enrichVars(kind, data, locale, {
    logoUrl: orgBranding.logoUrl,
    primaryColor: orgBranding.primaryColor,
  });

  const messages = getNotificationTemplate(def.template);
  if (!messages) {
    logger.error({ kind, template: def.template }, "notify: template not registered");
    return result;
  }
  const slot = messages[locale] ?? messages.en;

  for (const channel of def.channels) {
    // Soft-deleted users receive in-app (so cancellation reminders still
    // surface) but no outbound email/push (would leak to a deactivated address).
    if (user.deletedAt && channel !== "IN_APP") {
      result.skipped.push({ channel, reason: "user-soft-deleted" });
      continue;
    }
    const enabled = await isChannelEnabled({ userId: user.id, kind, channel });
    if (!enabled) {
      result.skipped.push({ channel, reason: "user-opted-out" });
      continue;
    }
    if (await isDuplicate(user.id, kind, dedupeKey, channel)) {
      result.skipped.push({ channel, reason: "duplicate-within-window" });
      continue;
    }

    const subject = renderString(slot.subject, vars);
    const inappBody = renderString(slot.inapp.body, vars);
    const link = slot.inapp.link ? renderString(slot.inapp.link, vars) : null;

    const row = await db.notification.create({
      data: {
        userId: user.id,
        kind,
        category: def.category,
        channel,
        subject,
        body: channel === "IN_APP" ? inappBody : null,
        link,
        dedupeKey,
      },
    });
    result.deliveryIds.push(row.id);

    if (channel === "EMAIL") {
      const text = renderString(slot.text, vars);
      const innerHtml = renderString(slot.html, vars);
      // Pass the full brand-enriched `vars` into the shell render so
      // the shell's `{{ appName }}` / `{{ logoUrl }}` / `{{ brandPrimary }}`
      // tokens substitute correctly. Without spreading `vars`, those
      // shell tokens stayed as literal text — which is what bit the
      // totp-disabled email (and every other notification email :
      // wordmark + footer + logo all rendered as raw `{{ … }}`).
      const html = renderString(EMAIL_SHELL, {
        ...vars,
        locale,
        subject,
        body: innerHtml,
      });
      const delivery = await sendMail({
        to: user.email,
        subject,
        text,
        html,
      });
      if (delivery.ok) {
        await db.notification.update({
          where: { id: row.id },
          data: { deliveredAt: new Date() },
        });
      } else {
        await db.notification.update({
          where: { id: row.id },
          data: { failedAt: new Date(), failureReason: delivery.reason },
        });
        const failedEvent: NotificationDeliveryFailedEvent = {
          type: "notification.delivery-failed",
          userId: user.id,
          kind,
          channel,
          notificationId: row.id,
          reason: delivery.reason,
          occurredAt: new Date(),
        };
        await emit(failedEvent).catch(() => {});
      }
    }

    const createdEvent: NotificationCreatedEvent = {
      type: "notification.created",
      userId: user.id,
      kind,
      category: def.category,
      channel,
      notificationId: row.id,
      occurredAt: new Date(),
    };
    await emit(createdEvent).catch(() => {});
  }

  return result;
}

/** Fan-out variant. Iterates `notify()` ; the DB write batching is left
 * for a later optimisation pass when actual fan-outs (announcements,
 * digests) are wired up. */
export async function notifyMany<K extends NotificationKind>(
  kind: K,
  recipients: Array<{ userId: string }>,
  data: NotificationDataMap[K],
): Promise<DispatchResult> {
  const aggregate: DispatchResult = { deliveryIds: [], skipped: [] };
  for (const recipient of recipients) {
    const r = await notify(kind, recipient, data);
    aggregate.deliveryIds.push(...r.deliveryIds);
    aggregate.skipped.push(...r.skipped);
  }
  return aggregate;
}

function computeDedupeKey(data: object): string {
  const stable = JSON.stringify(data, Object.keys(data).sort());
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

async function isDuplicate(
  userId: string,
  kind: NotificationKind,
  dedupeKey: string,
  channel: NotificationChannel,
): Promise<boolean> {
  const db = getDb();
  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const existing = await db.notification.findFirst({
    where: {
      userId,
      kind,
      channel,
      dedupeKey,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
  });
  return existing !== null;
}
