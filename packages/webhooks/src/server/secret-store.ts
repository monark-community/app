import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { logger } from "@monark/common"

/**
 * Secret store for webhook signing keys. Production deploys swap the
 * default in-memory store for one backed by AWS Secrets Manager / Vault
 * / GCP / Azure / etc. ; the dev process can opt into a file-backed
 * store via the `MONARK_DEV_WEBHOOK_SECRETS_FILE` env var so secrets
 * survive `pnpm dev` restarts without standing up a real secret manager.
 *
 * The router calls `rememberSecret(id, plaintext)` on create + rotate
 * and `forgetSecret(id)` on delete. The worker calls `resolveSecret(id)`
 * before signing each delivery. An in-memory cache fronts every
 * implementation so a long-running worker doesn't hammer the backing
 * store on the hot path.
 */
export type SecretStore = {
  put(endpointId: string, plaintext: string): Promise<void>
  get(endpointId: string): Promise<string | null>
  delete(endpointId: string): Promise<void>
}

const inMemoryCache = new Map<string, string>()

class InMemoryStore implements SecretStore {
  async put(endpointId: string, plaintext: string): Promise<void> {
    inMemoryCache.set(endpointId, plaintext)
  }
  async get(endpointId: string): Promise<string | null> {
    return inMemoryCache.get(endpointId) ?? null
  }
  async delete(endpointId: string): Promise<void> {
    inMemoryCache.delete(endpointId)
  }
}

class FileBackedStore implements SecretStore {
  constructor(private readonly path: string) {
    if (!existsSync(this.path)) {
      mkdirSync(dirname(this.path), { recursive: true })
      writeFileSync(this.path, "{}", { encoding: "utf8", mode: 0o600 })
    }
  }
  private read(): Record<string, string> {
    try {
      const raw = readFileSync(this.path, "utf8")
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, string>
      }
    } catch (err) {
      logger.error(
        { err, path: this.path },
        "webhook secrets file parse failed ; treating as empty",
      )
    }
    return {}
  }
  private write(map: Record<string, string>): void {
    writeFileSync(this.path, JSON.stringify(map, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    })
  }
  async put(endpointId: string, plaintext: string): Promise<void> {
    inMemoryCache.set(endpointId, plaintext)
    const map = this.read()
    map[endpointId] = plaintext
    this.write(map)
  }
  async get(endpointId: string): Promise<string | null> {
    const cached = inMemoryCache.get(endpointId)
    if (cached !== undefined) return cached
    const map = this.read()
    const value = map[endpointId]
    if (value !== undefined) inMemoryCache.set(endpointId, value)
    return value ?? null
  }
  async delete(endpointId: string): Promise<void> {
    inMemoryCache.delete(endpointId)
    const map = this.read()
    if (endpointId in map) {
      delete map[endpointId]
      this.write(map)
    }
  }
}

// Default file path for the dev-mode file-backed store. Lands at
// `<api cwd>/.cache/monark-webhook-secrets.json` ; gitignored via the
// repo's top-level `.cache/` rule. Operators who want a different
// path (shared across multiple processes, or pinned to an absolute
// location) override via `MONARK_DEV_WEBHOOK_SECRETS_FILE`.
const DEFAULT_DEV_PATH = resolve(
  process.cwd(),
  ".cache",
  "monark-webhook-secrets.json",
)

let activeStore: SecretStore = (() => {
  const explicit = process.env.MONARK_DEV_WEBHOOK_SECRETS_FILE
  const isProd = process.env.NODE_ENV === "production"

  // Production : never auto-engage a file-backed store. The deploy
  // is expected to wire `setWebhookSecretStore()` to AWS Secrets
  // Manager / Vault / GCP / Azure before the worker drains the
  // first delivery. The explicit env var is honored even in
  // production so a single-tenant self-hosted box can opt in, but
  // we log a warning since plaintext-on-disk is rarely the right
  // production answer.
  if (isProd) {
    if (explicit) {
      logger.warn(
        { path: explicit },
        "webhook secret store : file-backed in production via MONARK_DEV_WEBHOOK_SECRETS_FILE — consider migrating to a managed secret store",
      )
      return new FileBackedStore(explicit)
    }
    return new InMemoryStore()
  }

  // Non-production : default to file-backed so secrets survive
  // `pnpm dev` restarts. Without this, every restart erases the
  // in-memory map and existing endpoints fail with "no plaintext
  // secret available" until rotated. The default path is
  // gitignored ; setting `MONARK_DEV_WEBHOOK_SECRETS_FILE` overrides.
  const path = explicit ?? DEFAULT_DEV_PATH
  logger.info(
    { path, fromEnv: explicit !== undefined },
    "webhook secret store : file-backed (dev)",
  )
  return new FileBackedStore(path)
})()

export function setWebhookSecretStore(store: SecretStore): void {
  activeStore = store
}

export async function rememberSecret(
  endpointId: string,
  plaintext: string,
): Promise<void> {
  inMemoryCache.set(endpointId, plaintext)
  await activeStore.put(endpointId, plaintext)
}

export async function resolveSecret(
  endpointId: string,
): Promise<string | null> {
  const cached = inMemoryCache.get(endpointId)
  if (cached !== undefined) return cached
  const value = await activeStore.get(endpointId)
  if (value !== null) inMemoryCache.set(endpointId, value)
  return value
}

export async function forgetSecret(endpointId: string): Promise<void> {
  inMemoryCache.delete(endpointId)
  await activeStore.delete(endpointId)
}

export function _resetSecretStoreForTesting(): void {
  inMemoryCache.clear()
  activeStore = new InMemoryStore()
}
