import { spawn, type ChildProcess } from "node:child_process"
import { resolve } from "node:path"
import {
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test"

/**
 * Boots [tools/webhook-receiver.ts](../../../../tools/webhook-receiver.ts)
 * in a child process for the duration of one e2e spec. Exposes a small
 * client surface for the test :
 *
 *   - `url` — POST target the test feeds into the create-endpoint form.
 *   - `waitForCapture(predicate, timeoutMs)` — polls `/inbox` until a
 *     captured request matches the predicate. Times out otherwise.
 *   - `clear()` — DELETE /inbox so a follow-up assertion isn't
 *     polluted by earlier traffic.
 *   - `stop()` — SIGTERM the child process. Always called from the
 *     test's afterAll hook ; safe to call twice.
 *
 * The receiver runs in capture-only mode by default (no signature
 * verification) ; pass `verifySecret` to flip on HMAC validation so
 * the spec can assert end-to-end that the platform signs correctly.
 */

export type ReceiverCapture = {
  receivedAt: number
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
  json: unknown | null
  signatureValid: boolean | null
}

export type ReceiverHandle = {
  url: string
  port: number
  waitForCapture: (
    predicate: (c: ReceiverCapture) => boolean,
    timeoutMs?: number,
  ) => Promise<ReceiverCapture>
  list: () => Promise<ReceiverCapture[]>
  clear: () => Promise<void>
  stop: () => Promise<void>
}

const REPO_APP_ROOT = resolve(import.meta.dirname ?? __dirname, "..", "..", "..", "..", "..")

export async function startReceiver(options?: {
  port?: number
  verifySecret?: string
  failOnce?: boolean
}): Promise<ReceiverHandle> {
  const port = options?.port ?? 14123 + Math.floor(Math.random() * 1000)
  const args = ["tools/webhook-receiver.ts", "--port", String(port), "--quiet"]
  if (options?.verifySecret) args.push("--secret", options.verifySecret)
  if (options?.failOnce) args.push("--fail-once")

  // `pnpm tsx` is on PATH but we want to bind to the repo's pinned
  // tsx ; run via the package script so resolution is deterministic.
  const child = spawn("pnpm", ["tsx", ...args], {
    cwd: REPO_APP_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    shell: process.platform === "win32",
  })

  const url = `http://127.0.0.1:${port}`
  const api = await playwrightRequest.newContext({ baseURL: url })

  // Wait for /healthz to come up. The child can take a beat to spawn
  // tsx + start listening ; poll for up to 5s before giving up.
  const deadline = Date.now() + 5_000
  let ready = false
  while (Date.now() < deadline) {
    try {
      const resp = await api.get("/healthz", { timeout: 500 })
      if (resp.ok()) {
        ready = true
        break
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!ready) {
    child.kill("SIGTERM")
    throw new Error(`webhook-receiver did not come up on ${url}`)
  }

  return {
    url,
    port,
    waitForCapture: (predicate, timeoutMs = 15_000) =>
      waitForCapture(api, predicate, timeoutMs),
    list: () => listCaptures(api),
    clear: () => clearInbox(api),
    stop: () => stopReceiver(child, api),
  }
}

async function listCaptures(api: APIRequestContext): Promise<ReceiverCapture[]> {
  const resp = await api.get("/inbox")
  if (!resp.ok()) return []
  const body = (await resp.json()) as { captures?: ReceiverCapture[] }
  return body.captures ?? []
}

async function clearInbox(api: APIRequestContext): Promise<void> {
  await api.delete("/inbox")
}

async function waitForCapture(
  api: APIRequestContext,
  predicate: (c: ReceiverCapture) => boolean,
  timeoutMs: number,
): Promise<ReceiverCapture> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const captures = await listCaptures(api)
    const match = captures.find(predicate)
    if (match) return match
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(
    `webhook-receiver: no capture matched the predicate within ${timeoutMs}ms`,
  )
}

async function stopReceiver(
  child: ChildProcess,
  api: APIRequestContext,
): Promise<void> {
  await api.dispose().catch(() => {})
  if (child.exitCode !== null) return
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve())
    child.kill("SIGTERM")
    // Hard-kill backstop : if SIGTERM doesn't land within 2s, SIGKILL.
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL")
    }, 2_000)
  })
}
