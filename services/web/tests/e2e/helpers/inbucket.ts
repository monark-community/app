import { request as playwrightRequest, type APIRequestContext } from "@playwright/test"

/**
 * Inbucket polling helper. Inbucket is what Supabase's local stack
 * ships (port 54324 web UI, 54325 SMTP) ; its REST API differs from
 * Mailpit's so we keep the two clients separate. Mailpit users can
 * keep running the existing [mailpit.ts](./mailpit.ts) helper ; CI +
 * `supabase start`-based local dev get this one.
 *
 * API surface used here (only what's needed for verification + reset
 * flows). Full reference : https://inbucket.org/api/
 *
 *   - GET    /api/v1/mailbox/{name}             list mailbox entries
 *   - GET    /api/v1/mailbox/{name}/{id}        full message body
 *   - DELETE /api/v1/mailbox/{name}             clear a mailbox
 *   - DELETE /api/v1/mailbox/{name}/{id}        delete one message
 *
 * Inbucket addresses the inbox by the local-part *or* the full
 * email. We use the full email for symmetry with Mailpit's
 * `to:<email>` query syntax.
 */

const DEFAULT_BASE_URL = "http://localhost:54324"
const POLL_INTERVAL_MS = 500
const DEFAULT_TIMEOUT_MS = 15_000

export type InbucketMessageHeader = {
  id: string
  from: string
  to: string[]
  subject: string
  date: string
  size: number
}

export type InbucketMessage = {
  body: { text: string; html: string }
  header: { Subject: string[]; From: string[]; To: string[] }
  attachments: unknown[]
}

function getBaseUrl(): string {
  return process.env.INBUCKET_URL ?? DEFAULT_BASE_URL
}

async function withApi<T>(fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const api = await playwrightRequest.newContext({ baseURL: getBaseUrl() })
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

/** Wipes the mailbox so polling can't latch onto a stale message. */
export async function clearInbucket(email: string): Promise<void> {
  await withApi(async (api) => {
    const response = await api.delete(
      `/api/v1/mailbox/${encodeURIComponent(email)}`,
    )
    // Inbucket returns 200 even for unknown mailboxes ; only 5xx
    // counts as a real failure here.
    if (response.status() >= 500) {
      throw new Error(`inbucket clear failed: ${response.status()}`)
    }
  })
}

/**
 * Polls the recipient's mailbox until at least one message arrives
 * (optionally matching a subject pattern), then returns the full
 * body. Throws after `timeoutMs` if nothing matches.
 */
export async function waitForLatestEmail(input: {
  to: string
  subjectMatches?: RegExp
  timeoutMs?: number
}): Promise<{ subject: string; text: string; html: string; id: string }> {
  const timeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + timeout
  const mailbox = encodeURIComponent(input.to)

  return withApi(async (api) => {
    while (Date.now() < deadline) {
      const list = await api.get(`/api/v1/mailbox/${mailbox}`)
      if (!list.ok()) {
        // 404 is "mailbox not seen yet" — keep polling.
        if (list.status() === 404) {
          await sleep(POLL_INTERVAL_MS)
          continue
        }
        throw new Error(`inbucket list failed: ${list.status()}`)
      }
      const headers = (await list.json()) as InbucketMessageHeader[]
      const matches = input.subjectMatches
        ? headers.filter((m) => input.subjectMatches!.test(m.subject))
        : headers
      if (matches.length > 0) {
        // Latest first — Inbucket returns by descending date.
        const head = matches[0]!
        const detail = await api.get(`/api/v1/mailbox/${mailbox}/${head.id}`)
        if (!detail.ok()) {
          throw new Error(`inbucket message fetch failed: ${detail.status()}`)
        }
        const message = (await detail.json()) as InbucketMessage
        return {
          id: head.id,
          subject: head.subject,
          text: message.body.text ?? "",
          html: message.body.html ?? "",
        }
      }
      await sleep(POLL_INTERVAL_MS)
    }
    throw new Error(
      `inbucket: no message for to=${input.to}` +
        (input.subjectMatches ? ` matching ${input.subjectMatches}` : "") +
        ` within ${timeout}ms`,
    )
  })
}

/** Plucks the first http(s) URL out of an email body. */
export function extractFirstUrl(body: string, pattern?: RegExp): string {
  const re = pattern ?? /https?:\/\/[^\s<>"]+/i
  const match = body.match(re)
  if (!match) {
    throw new Error(
      `extractFirstUrl: no URL matching ${re} found in body of length ${body.length}`,
    )
  }
  return match[0]
}

/** Plucks a 6-digit OTP code from an email body. Order matters : prefer
 * the dedicated regex if the caller supplies one (templates that wrap
 * the code in a span / specific class) ; fall back to "first 6 digits in
 * a row that aren't part of a longer string of digits". */
export function extractOtp(body: string, pattern?: RegExp): string {
  const re = pattern ?? /(?<![0-9])(\d{6})(?![0-9])/
  const match = body.match(re)
  if (!match) {
    throw new Error(
      `extractOtp: no 6-digit code matching ${re} found in body of length ${body.length}`,
    )
  }
  return match[1] ?? match[0]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
