import { z } from "zod";
import { sendMail } from "@monark/notifications/server";
import { defineNode } from "../registry";

/**
 * Send a raw email to an address (as opposed to the Notification node, which
 * dispatches an in-app + email notification keyed to a user). Uses the shared
 * SMTP transport ; not permission-gated (same as the notification/webhook
 * nodes). `to` / `subject` / `body` are interpolated by the engine.
 */
export const sendEmailNode = defineNode({
  descriptor: {
    kind: "action",
    category: "communication",
    label: "Send Email",
    description: "Send a raw email to an address.",
    icon: "Mail",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "to", type: "string", description: "The address the email was sent to." },
      { key: "sent", type: "boolean", description: "Whether the send succeeded." },
    ],
    configFields: [
      { key: "to", label: "To", type: "text", required: true, placeholder: "person@example.com" },
      { key: "subject", label: "Subject", type: "text", required: true },
      { key: "body", label: "Body", type: "textarea", required: true },
    ],
  },
  configSchema: z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  execute: async (ctx, config) => {
    ctx.log(`Sending email to ${config.to} (subject: "${config.subject}").`);
    const result = await sendMail({ to: config.to, subject: config.subject, text: config.body });
    if (!result.ok) throw new Error(`Email to ${config.to} failed: ${result.reason}`);
    ctx.log(`Email delivered to ${config.to}.`);
    return { to: config.to, sent: true };
  },
});
