import { createTransport, type Transporter } from "nodemailer";
import { BRANDING } from "@monark/branding";
import { logger } from "@monark/common";

let cached: Transporter | null | undefined;

/**
 * Lazy SMTP transport. Reads `SMTP_URL` once on first call (e.g.
 * `smtp://user:pass@host:1025` for Mailpit; full provider URL in prod).
 * Returns null when unset so callers degrade to log-only ; this is the
 * deliberate dev mode and lets unit tests exercise the dispatch path
 * without running a transport.
 */
function getTransport(): Transporter | null {
  if (cached !== undefined) return cached;
  const url = process.env.SMTP_URL;
  if (!url) {
    cached = null;
    return null;
  }
  cached = createTransport(url);
  return cached;
}

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailDeliveryResult = { ok: true } | { ok: false; reason: string };

/**
 * Best-effort send. Logs the would-be message when SMTP is unconfigured
 * (dev) or when the transport throws (failure). Returns a structured
 * result so the dispatch path can record the outcome on the Notification
 * row (`failedAt` + `failureReason`) without re-throwing into the
 * triggering action.
 */
export async function sendMail(message: MailMessage): Promise<MailDeliveryResult> {
  const transport = getTransport();
  const from = process.env.SMTP_FROM ?? BRANDING.fromEmail;
  if (!transport) {
    logger.info(
      { to: message.to, subject: message.subject },
      "[notifications/email] SMTP_URL not set; would have sent",
    );
    return { ok: true };
  }
  try {
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? undefined,
    });
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, to: message.to, subject: message.subject },
      "[notifications/email] send failed",
    );
    return { ok: false, reason };
  }
}

/** Test helper ; lets the unit suite reset the lazy cache between cases. */
export function _resetTransportCacheForTesting(): void {
  cached = undefined;
}
