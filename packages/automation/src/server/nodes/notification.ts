import { z } from "zod";
import { notify } from "@monark/notifications/server";
import { defineNode } from "../registry";

// notify() is typed via the NotificationDataRegistry declaration merge, but that
// augmentation doesn't reliably survive a consumer package cross-compiling our
// source. We pin the kind literal + data shape here ; the kind is registered at
// boot via registerAutomationNotificationKinds(), so this is sound at runtime.
const notifyCustomMessage = notify as unknown as (
  kind: "automation.custom-message",
  recipient: { userId: string },
  data: { subject: string; body: string },
) => Promise<unknown>;

/**
 * Send an in-app + email notification to a user. Recipient is a user id
 * (often supplied via `{{ trigger.actorId }}` / `{{ trigger.userId }}`) ;
 * subject + body are interpolated by the engine before this runs. Dispatch is
 * best-effort inside notify() (respects the recipient's channel prefs).
 */
export const notificationNode = defineNode({
  descriptor: {
    kind: "action",
    category: "communication",
    label: "Send Notification",
    description: "Send an in-app + email notification to a user.",
    icon: "Bell",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    configFields: [
      {
        key: "recipientUserId",
        label: "Recipient",
        type: "user",
        required: true,
        help: "The user to notify. Supports {{ trigger.actorId }}.",
      },
      { key: "subject", label: "Subject", type: "text", required: true },
      { key: "body", label: "Message", type: "textarea", required: true },
    ],
  },
  configSchema: z.object({
    recipientUserId: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  execute: async (_ctx, config) => {
    await notifyCustomMessage(
      "automation.custom-message",
      { userId: config.recipientUserId },
      { subject: config.subject, body: config.body },
    );
    return { recipientUserId: config.recipientUserId, delivered: true };
  },
});
