import { createTransport, type Transporter } from "nodemailer"
import { logger } from "@monark/common"

let cached: Transporter | null | undefined

// Lazy SMTP transport. Picks up `SMTP_URL` (e.g. "smtp://user:pass@host:1025"
// for Mailpit local, or your prod provider's connection string). Returns
// null when not configured so callers degrade to log-only.
function getTransport(): Transporter | null {
  if (cached !== undefined) return cached
  const url = process.env.SMTP_URL
  if (!url) {
    cached = null
    return null
  }
  cached = createTransport(url)
  return cached
}

export type MailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

// Best-effort send; logs the message body when SMTP isn't configured so
// dev environments still surface what would have been delivered.
export async function sendMail(message: MailMessage): Promise<void> {
  const transport = getTransport()
  const from = process.env.SMTP_FROM ?? "Monark <noreply@monark.io>"
  if (!transport) {
    logger.info(
      { to: message.to, subject: message.subject },
      "[mailer] SMTP_URL not set; would have sent",
    )
    return
  }
  try {
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? undefined,
    })
  } catch (err) {
    logger.error({ err, to: message.to, subject: message.subject }, "mail send failed")
  }
}
