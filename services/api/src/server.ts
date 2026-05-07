import express from "express"
import cors from "cors"
import { createExpressMiddleware } from "@trpc/server/adapters/express"
import { logger } from "@monark/common"
import {
  processExpiredDeletions,
  registerAuthEventTypes,
  registerAuthFeatureFlags,
} from "@monark/auth/server"
import {
  registerFeatureFlagsEventTypes,
  registerFeatureFlagsPermissions,
  syncFlagsToDatabase,
} from "@monark/feature-flags/server"
import {
  registerCoreNotificationKinds,
  registerNotificationsEventTypes,
  registerNotificationSubscribers,
} from "@monark/notifications/server"
import {
  ensureSingletonOrganizationFromInput,
  registerOrganizationsEventTypes,
  registerOrganizationsFeatureFlags,
  registerOrganizationsPermissions,
  registerOrganizationsSubscribers,
} from "@monark/organizations/server"
import {
  registerRbacEventTypes,
  registerRbacPermissions,
} from "@monark/rbac/server"
import {
  registerUsersEventTypes,
  registerUsersPermissions,
} from "@monark/users/server"
import {
  registerWebhookSubscribers,
  registerWebhooksPermissions,
  startWebhookDeliveryWorker,
  tickOnce as webhookWorkerTick,
} from "@monark/webhooks/server"
import { evaluateCronAuth } from "./lib/cron-auth"
import { env } from "./lib/env"
import { httpLogger } from "./lib/http-logger"
import { appRouter } from "./trpc/router"
import { createContext } from "./trpc/context"

// ── Boot-time module registrations ───────────────────────────────────
// Every module that owns flags or permissions registers them here, in
// a deterministic order, before any code path resolves a flag or
// checks a permission. The order is alphabetical for predictability ;
// modules don't have dependency-order requirements at registration
// time because the registry is a flat namespace per kind.
//
// Extended modules drop their `register<Module>FeatureFlags()` /
// `register<Module>Permissions()` calls in here too. The
// `registerFromManifest()`-style codegen lands in a later phase ; for
// now the manifest is hand-maintained.
registerAuthFeatureFlags()
registerOrganizationsFeatureFlags()

registerFeatureFlagsPermissions()
registerOrganizationsPermissions()
registerRbacPermissions()
registerUsersPermissions()
registerWebhooksPermissions()

// Event-type registrations feed the webhook admin UI's guided
// subscription picker. Order doesn't matter ; the registry is a flat
// namespace keyed on the wire-level event type. Webhook-internal
// event types (`webhook.*`) intentionally aren't registered — the
// subscriber filter skips them to avoid recursion, so showing them
// in the picker would be misleading.
registerAuthEventTypes()
registerFeatureFlagsEventTypes()
registerNotificationsEventTypes()
registerOrganizationsEventTypes()
registerRbacEventTypes()
registerUsersEventTypes()

// Notification kinds + templates need to be registered before any
// subscriber can call `notify()` ; subscriber registration follows
// kind registration.
registerCoreNotificationKinds()

// Domain event listeners are registered once at process boot. Add new ones
// here as more event-driven side-effects come online. The organizations
// subscriber MUST register before the webhook subscriber so the auto-
// membership upsert (`organization.member-joined` emit) lands on the
// bus before webhook routing decides which org-scoped endpoints
// receive a derived event. The webhook subscriber registers last so
// its outbox writer sees a stable event-bus configuration.
registerOrganizationsSubscribers()
registerNotificationSubscribers()
registerWebhookSubscribers()

// Webhook delivery worker drains the outbox on a setInterval. The
// `/cron/sweep-webhook-deliveries` endpoint below is an external
// fallback (Vercel Cron, GitHub Actions, k8s CronJob) so a single
// api crash doesn't strand the outbox.
startWebhookDeliveryWorker()

// Sync the merged flag registry into the FeatureFlag table so the
// /admin/feature-flags surface can read definitions, and overrides
// pin to real flag rows. Idempotent — safe to re-run on every boot.
// Fire-and-forget : a DB hiccup here doesn't block the api process.
void syncFlagsToDatabase().catch((err) =>
  logger.error({ err }, "syncFlagsToDatabase failed at boot"),
)

// Single-tenant bootstrap. When the `tenancy.multi-tenant` flag is OFF
// (default) and the deploy is missing its singleton organization, read
// the INITIAL_ORG_* env vars and provision the row. Idempotent : a
// re-run on a healthy install short-circuits inside the helper. Failures
// here are logged but don't crash the API process — the /setup page
// surfaces the still-stuck state and the operator can fix the env
// without a container restart loop.
//
// Explicit logging at every decision point so an operator looking at
// `pnpm dev:api` output can tell why a bootstrap was a no-op (env
// missing? feature flag flipped? org already there?) without strapping
// on a debugger.
async function maybeBootstrapSingletonOrg(): Promise<void> {
  logger.info(
    {
      hasSlug: Boolean(env.INITIAL_ORG_SLUG),
      hasName: Boolean(env.INITIAL_ORG_NAME),
      hasColor: Boolean(env.INITIAL_ORG_PRIMARY_COLOR),
    },
    "Single-tenant bootstrap : evaluating boot-time hook",
  )
  const result = await ensureSingletonOrganizationFromInput({
    slug: env.INITIAL_ORG_SLUG ?? null,
    displayName: env.INITIAL_ORG_NAME ?? null,
    primaryColor: env.INITIAL_ORG_PRIMARY_COLOR ?? null,
    actorId: "system:bootstrap",
  })
  if (result.ok) {
    if (result.created) {
      logger.info(
        { organizationId: result.organizationId, slug: env.INITIAL_ORG_SLUG },
        "Single-tenant bootstrap : created singleton organization",
      )
    } else {
      logger.info(
        { organizationId: result.organizationId },
        "Single-tenant bootstrap : singleton already exists, no-op",
      )
    }
    return
  }
  const detail = "detail" in result ? result.detail : undefined
  if (result.reason === "already-multi-tenant") {
    logger.info(
      "Single-tenant bootstrap : tenancy.multi-tenant is ON, skipping env-driven provision",
    )
    return
  }
  if (result.reason === "env-not-set") {
    logger.warn(
      {
        hasSlug: Boolean(env.INITIAL_ORG_SLUG),
        hasName: Boolean(env.INITIAL_ORG_NAME),
      },
      "Single-tenant bootstrap : INITIAL_ORG_SLUG / INITIAL_ORG_NAME not set, /setup will stay stuck",
    )
    return
  }
  logger.error(
    { reason: result.reason, detail },
    "Single-tenant bootstrap failed ; /setup will stay stuck",
  )
}

void maybeBootstrapSingletonOrg()

const app = express()

// Dev-only CORS escape hatch : allow any RFC 1918 / loopback origin so
// a phone (or other LAN device) can hit the api at the developer's
// machine without requiring `WEB_ORIGIN` to be edited per-IP. Matches
// the loopback-rewrite the browser-side tRPC + Supabase clients do for
// the same scenario. Production stays strict (only exact `WEB_ORIGIN`
// entries are allowed) so we don't ship permissive CORS by accident.
const PRIVATE_HOST_RE =
  /^(localhost|127\.0\.0\.1|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/

function isAllowedOrigin(origin: string): boolean {
  if (env.WEB_ORIGIN.includes(origin)) return true
  if (env.NODE_ENV !== "development") return false
  try {
    const url = new URL(origin)
    return PRIVATE_HOST_RE.test(url.hostname)
  } catch {
    return false
  }
}

app.use(httpLogger)
app.use(
  cors({
    origin: (origin, callback) => {
      // allow tools / server-to-server calls with no Origin header
      if (!origin) return callback(null, true)
      if (isAllowedOrigin(origin)) return callback(null, true)
      // In dev, surface the rejection prominently so a developer
      // testing from a LAN device sees why their request was blocked
      // instead of just an opaque 500. Production stays quiet.
      if (env.NODE_ENV === "development") {
        logger.warn(
          { origin, allowList: env.WEB_ORIGIN },
          "CORS rejected non-private origin in dev — add it to WEB_ORIGIN if intentional",
        )
      }
      return callback(new Error(`CORS: origin not allowed: ${origin}`))
    },
    credentials: true,
  }),
)
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" })
})

// Cron endpoints. Auth is `Authorization: Bearer ${CRON_SECRET}` so any
// scheduler that can hit an HTTPS URL works (Vercel Cron, GitHub Actions,
// EasyCron, an in-cluster k8s CronJob ...). The functions themselves are
// idempotent ; reruns or simultaneous invocations don't double-process.
//
// Manual trigger in dev :
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        http://localhost:4000/cron/process-account-deletions
function checkCronSecret(req: express.Request, res: express.Response): boolean {
  const result = evaluateCronAuth({
    authorizationHeader: req.header("authorization"),
    cronSecret: env.CRON_SECRET,
  })
  if (result.ok) return true
  if (result.reason === "not-configured") {
    logger.error("CRON_SECRET is not configured ; refusing cron request")
    res.status(503).json({ ok: false, error: "not-configured" })
    return false
  }
  res.status(401).json({ ok: false, error: "unauthorized" })
  return false
}

app.post("/cron/process-account-deletions", async (req, res) => {
  if (!checkCronSecret(req, res)) return
  try {
    const result = await processExpiredDeletions()
    logger.info({ ...result }, "processExpiredDeletions sweep complete")
    res.json({ ok: true, ...result })
  } catch (error) {
    logger.error({ err: error }, "processExpiredDeletions sweep failed")
    res.status(500).json({ ok: false, error: "internal" })
  }
})

// External fallback for the in-process webhook delivery worker. The
// in-process loop runs every few seconds while the api is healthy ;
// this endpoint exists so a Vercel Cron (or equivalent) can keep the
// outbox draining if every api replica is wedged. Idempotent — the
// worker's `tickOnce()` skips when another tick is in flight.
app.post("/cron/sweep-webhook-deliveries", async (req, res) => {
  if (!checkCronSecret(req, res)) return
  try {
    const result = await webhookWorkerTick()
    logger.info({ ...result }, "webhook delivery sweep complete")
    res.json({ ok: true, ...result })
  } catch (error) {
    logger.error({ err: error }, "webhook delivery sweep failed")
    res.status(500).json({ ok: false, error: "internal" })
  }
})

app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    // Surface the underlying error so 500s aren't opaque in the access log.
    // Without this, pino-http only sees "response was 500" ; the cause
    // (Prisma error, missing table, unhandled exception inside a procedure,
    // etc.) never lands in a line. We log here at a level matched to the
    // tRPC error code so the access log can stay focused on the request /
    // response shape and this line carries the diagnostic detail.
    onError: ({ error, type, path, input, ctx }) => {
      const code = error.code
      // Expected client-side errors stay at warn ; only unhandled / server
      // failures escalate to error so alert pipelines on 5xx-equivalents
      // can branch on level.
      const isExpected =
        code === "UNAUTHORIZED" ||
        code === "FORBIDDEN" ||
        code === "NOT_FOUND" ||
        code === "BAD_REQUEST" ||
        code === "CONFLICT" ||
        code === "PRECONDITION_FAILED" ||
        code === "TOO_MANY_REQUESTS"
      const level = isExpected ? "warn" : "error"
      logger[level](
        {
          procedure: path,
          procedureType: type,
          code,
          userId: ctx?.userId ?? null,
          requestId: ctx?.requestId,
          // `error.cause` is the underlying throw (Prisma error, etc.) when
          // tRPC re-wrapped it ; falling back to the tRPC error itself
          // covers cases where the procedure threw a TRPCError directly.
          err: error.cause ?? error,
          // Keep `input` as a boolean only — its contents may carry the
          // same sensitive values we strip from the URL (cookieValue, …).
          hasInput: input !== undefined,
        },
        `trpc ${type} ${path} ${code}: ${error.message}`,
      )
    },
  }),
)

// Explicit 0.0.0.0 bind so the api is reachable from other devices on
// the LAN (phone testing) without depending on Node's IPv4/IPv6
// dual-stack defaulting. Production deploys behind a reverse proxy
// don't care which interface we bind to ; the proxy talks to localhost
// inside the container.
app.listen(env.PORT, "0.0.0.0", () => {
  logger.info({ port: env.PORT }, "api listening")
})
