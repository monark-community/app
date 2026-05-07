import { request as playwrightRequest, type APIRequestContext } from "@playwright/test"

/**
 * Mailpit polling helper. Mailpit's HTTP API
 * (https://mailpit.axllent.org/docs/api-v1/) exposes `/api/v1/search` for
 * inbox queries and `/api/v1/message/<id>` for full body retrieval.
 *
 * Tests that need a verification link should:
 *   1. trigger the action that sends the email,
 *   2. await `waitForLatestEmail({ to })`,
 *   3. extract the URL with `extractFirstUrl(...)`.
 *
 * The default base URL matches our local Mailpit container; CI should set
 * `MAILPIT_URL` to the appropriate address.
 */

export type MailpitMessage = {
  ID: string
  MessageID: string
  From: { Address: string; Name?: string }
  To: Array<{ Address: string; Name?: string }>
  Subject: string
  Created: string
}

export type MailpitMessageBody = {
  ID: string
  Text: string
  HTML: string
  Subject: string
}

const DEFAULT_BASE_URL = "http://localhost:8025"
const POLL_INTERVAL_MS = 500
const DEFAULT_TIMEOUT_MS = 15_000

function getBaseUrl(): string {
  return process.env.MAILPIT_URL ?? DEFAULT_BASE_URL
}

async function withApi<T>(fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const api = await playwrightRequest.newContext({ baseURL: getBaseUrl() })
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

export async function clearMailpit(): Promise<void> {
  await withApi(async (api) => {
    const response = await api.delete("/api/v1/messages")
    if (!response.ok()) {
      throw new Error(`mailpit delete failed: ${response.status()}`)
    }
  })
}

export async function waitForLatestEmail(input: {
  to: string
  subjectMatches?: RegExp
  timeoutMs?: number
}): Promise<MailpitMessageBody> {
  const timeout = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + timeout
  const query = `to:${input.to}`

  return withApi(async (api) => {
    while (Date.now() < deadline) {
      const search = await api.get(
        `/api/v1/search?query=${encodeURIComponent(query)}`,
      )
      if (!search.ok()) {
        throw new Error(`mailpit search failed: ${search.status()}`)
      }
      const data = (await search.json()) as { messages: MailpitMessage[] }
      const matches = input.subjectMatches
        ? data.messages.filter((m) => input.subjectMatches!.test(m.Subject))
        : data.messages
      if (matches.length > 0) {
        const head = matches[0]!
        const detail = await api.get(`/api/v1/message/${head.ID}`)
        if (!detail.ok()) {
          throw new Error(`mailpit message fetch failed: ${detail.status()}`)
        }
        return (await detail.json()) as MailpitMessageBody
      }
      await sleep(POLL_INTERVAL_MS)
    }
    throw new Error(
      `mailpit: no message for to=${input.to}` +
        (input.subjectMatches ? ` matching ${input.subjectMatches}` : "") +
        ` within ${timeout}ms`,
    )
  })
}

export function extractFirstUrl(body: string, pattern?: RegExp): string {
  // Prefer the first match of the caller's pattern; fall back to any URL.
  const re = pattern ?? /https?:\/\/[^\s<>"]+/i
  const match = body.match(re)
  if (!match) {
    throw new Error(
      `extractFirstUrl: no URL matching ${re} found in body of length ${body.length}`,
    )
  }
  return match[0]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
