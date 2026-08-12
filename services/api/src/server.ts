// Sentry must initialise before express / http are imported so its
// auto-instrumentation can wrap them ; this side-effect import runs first.
import "./instrument";
import * as Sentry from "@sentry/node";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { AppError, installDevEventTap, logger } from "@monark/common";
import {
  processExpiredDeletions,
  registerAuthEventTypes,
  registerAuthFeatureFlags,
} from "@monark/auth/server";
import {
  registerFeatureFlagsEventTypes,
  registerFeatureFlagsPermissions,
  syncFlagsToDatabase,
} from "@monark/feature-flags/server";
import {
  registerCoreNotificationKinds,
  registerNotificationsEventTypes,
  registerNotificationSubscribers,
} from "@monark/notifications/server";
import {
  ensureSingletonOrganizationFromInput,
  registerOrganizationsEventTypes,
  registerOrganizationsFeatureFlags,
  registerOrganizationsPermissions,
  registerOrganizationsSubscribers,
} from "@monark/organizations/server";
import {
  registerCalendarPermissions,
  registerCalendarEventTypes,
  registerCalendarNotificationKinds,
  registerCalendarSearchSource,
  registerCalendarModelIntegration,
  registerCalendarDataModelSubscriber,
  getPendingReminders,
  markReminderNotified,
  listCalendarMembers,
} from "@monark/calendar/server";
import {
  ensureDataModelFilesBucket,
  hydrateDataModelRegistrations,
  registerDataModelRecordWatchSubscriber,
  registerDataModelsEventTypes,
  registerDataModelsSearchSource,
  registerDataModelsFeatureFlags,
  registerDataModelsNotificationKinds,
  registerDataModelsPermissions,
  registerDataModelVisibilityResolvers,
} from "@monark/data-models/server";
import {
  registerAutomationEventTypes,
  registerAutomationFeatureFlags,
  handleHttpTrigger,
  registerAutomationNotificationKinds,
  registerAutomationPermissions,
  registerAutomationSearchSource,
  registerAutomationSubscribers,
  registerBuiltinAutomationNodes,
  runDueSchedules,
  startAutomationWorker,
} from "@monark/automation/server";
import {
  registerKanbanEventTypes,
  registerKanbanSearchSource,
  registerKanbanFeatureFlags,
  registerKanbanNotificationKinds,
  registerKanbanNotificationSubscriber,
  registerKanbanPermissions,
} from "@monark/kanban/server";
import {
  registerAchievementsPermissions,
  registerAchievementsEventTypes,
  registerAchievementsFeatureFlags,
  registerAchievementsNotificationKinds,
  registerAchievementsSubscriber,
  startAchievementsWorker,
  ensureAchievementIconsBucket,
} from "@monark/achievements/server";
import {
  registerWikiAutomationNodes,
  registerWikiEventTypes,
  registerWikiSearchSource,
  registerWikiFeatureFlags,
  registerWikiPermissions,
} from "@monark/wiki/server";
import {
  registerGithubAutomationNodes,
  registerGithubEventTypes,
  registerGithubFeatureFlags,
  registerGithubPermissions,
  handleGithubWebhook,
} from "@monark/github/server";
import {
  registerDiscordAutomationNodes,
  registerDiscordFeatureFlags,
} from "@monark/discord/server";
import {
  registerTelegramAutomationNodes,
  registerTelegramEventTypes,
  registerTelegramFeatureFlags,
  registerTelegramPermissions,
  handleTelegramWebhook,
} from "@monark/telegram/server";
import {
  registerTwitterAutomationNodes,
  registerTwitterFeatureFlags,
  registerTwitterPermissions,
} from "@monark/twitter/server";
import {
  registerFilesEventTypes,
  registerFilesFeatureFlags,
  registerFilesPermissions,
} from "@monark/files/server";
import { registerRbacEventTypes, registerRbacPermissions } from "@monark/rbac/server";
import { registerSecretsEventTypes, registerSecretsPermissions } from "@monark/secrets/server";
import {
  registerChatEventTypes,
  registerChatFeatureFlags,
  registerChatPermissions,
  sendMessage as sendChatMessage,
  setChatToolExecutor,
} from "@monark/chat/server";
import type { ChatMessageContext } from "@monark/chat/contracts";
import { buildChatToolset } from "./chat/tools";
import { registerApiKeysEventTypes, registerApiKeysPermissions } from "@monark/api-keys/server";
import { registerPublicApiFeatureFlags } from "@monark/public-api/server";
import { registerUsersEventTypes, registerUsersPermissions } from "@monark/users/server";
import {
  makeEnvVarSecretResolver,
  registerWebhookSubscribers,
  registerWebhooksPermissions,
  setWebhookSecretResolver,
  startWebhookDeliveryWorker,
  tickOnce as webhookWorkerTick,
} from "@monark/webhooks/server";
import { evaluateCronAuth } from "./lib/cron-auth";
import { env } from "./lib/env";
import { httpLogger } from "./lib/http-logger";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { mountPublicApi } from "./public/mount";

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
registerAuthFeatureFlags();
registerAutomationFeatureFlags();
registerChatFeatureFlags();
registerDataModelsFeatureFlags();
registerFilesFeatureFlags();
registerKanbanFeatureFlags();
registerAchievementsFeatureFlags();
registerWikiFeatureFlags();
registerGithubFeatureFlags();
registerDiscordFeatureFlags();
registerTelegramFeatureFlags();
registerTwitterFeatureFlags();
registerOrganizationsFeatureFlags();
registerPublicApiFeatureFlags();

registerAutomationPermissions();
registerCalendarPermissions();
registerChatPermissions();
registerDataModelsPermissions();
registerFeatureFlagsPermissions();
registerFilesPermissions();
registerKanbanPermissions();
registerAchievementsPermissions();
registerWikiPermissions();
registerGithubPermissions();
registerTelegramPermissions();
registerTwitterPermissions();
registerOrganizationsPermissions();
registerRbacPermissions();
registerSecretsPermissions();
registerApiKeysPermissions();
registerUsersPermissions();
registerWebhooksPermissions();

// Event-type registrations feed the webhook admin UI's guided
// subscription picker. Order doesn't matter ; the registry is a flat
// namespace keyed on the wire-level event type. Webhook-internal
// event types (`webhook.*`) intentionally aren't registered — the
// subscriber filter skips them to avoid recursion, so showing them
// in the picker would be misleading.
registerAuthEventTypes();
registerAutomationEventTypes();
registerCalendarEventTypes();
registerChatEventTypes();
registerDataModelsEventTypes();
registerFeatureFlagsEventTypes();
registerFilesEventTypes();
registerKanbanEventTypes();
registerAchievementsEventTypes();
registerWikiEventTypes();
registerGithubEventTypes();
registerTelegramEventTypes();
registerNotificationsEventTypes();
registerOrganizationsEventTypes();
registerRbacEventTypes();
registerSecretsEventTypes();
registerApiKeysEventTypes();
registerUsersEventTypes();

// Org-scoped visibility resolvers for per-Data-Model permissions + event
// types : the RBAC catalog + webhook picker show each org only its own
// models' entries even though the entries are globally registered. Pure
// function-ref registration (the DB query runs per admin catalog read).
registerDataModelVisibilityResolvers();

// Notification kinds + templates need to be registered before any
// subscriber can call `notify()` ; subscriber registration follows
// kind registration.
registerCoreNotificationKinds();
registerAutomationNotificationKinds();
registerCalendarNotificationKinds();
registerDataModelsNotificationKinds();
registerKanbanNotificationKinds();
registerAchievementsNotificationKinds();

// Register the built-in automation node types (event-trigger + action nodes)
// into the node registry so the engine can resolve a graph's node types and
// the editor palette can enumerate them. Extended modules add their own nodes
// via registerAutomationNodes() alongside this.
registerBuiltinAutomationNodes();
// Extended modules contribute their automation nodes the same way.
registerGithubAutomationNodes();
registerDiscordAutomationNodes();
registerTelegramAutomationNodes();
registerTwitterAutomationNodes();
registerWikiAutomationNodes();

// Global-search sources — each module contributes results to the unified command
// palette (`search.global`) by registering a source (see @monark/common's
// search-registry). Order here is the group order in the palette.
registerWikiSearchSource();
registerKanbanSearchSource();
registerCalendarSearchSource();
registerDataModelsSearchSource();
registerAutomationSearchSource();

// Wire the in-app AI chat agent's tool executor over the SAME public-API route
// registry (`V1_ROUTES`) the MCP server uses, but executed in-process through
// the tRPC caller so each tool runs as the logged-in user with their RBAC. Pure
// in-memory wiring, like registerBuiltinAutomationNodes above ; must run before
// any chat message is processed.
setChatToolExecutor(buildChatToolset());

// Model-integration registrations declare a module's "slots" to the
// polymorphic Data Models engine (@monark/data-models's
// registerModelIntegration) — must run before any admin request could try
// to save a mapping against a module that hasn't declared its slots yet.
registerCalendarModelIntegration();

// Domain event listeners are registered once at process boot. Add new ones
// here as more event-driven side-effects come online. The organizations
// subscriber MUST register before the webhook subscriber so the auto-
// membership upsert (`organization.member-joined` emit) lands on the
// bus before webhook routing decides which org-scoped endpoints
// receive a derived event. The webhook subscriber registers last so
// its outbox writer sees a stable event-bus configuration.
registerOrganizationsSubscribers();
registerCalendarDataModelSubscriber();
registerDataModelRecordWatchSubscriber();
registerKanbanNotificationSubscriber();
registerNotificationSubscribers();
// The automation trigger engine's wildcard subscriber: matches events against
// enabled automations and enqueues runs. Registered before the webhook
// subscriber (which must stay last) ; it ignores `automation.*` events itself.
registerAutomationSubscribers();
registerAchievementsSubscriber();
registerWebhookSubscribers();

// Dev-only : record every emitted domain event into an in-memory ring buffer so
// the dev-overlay "event bus" panel can show what just fired. Registered last so
// it observes the fully-wired bus; never installed in production.
if (process.env.NODE_ENV !== "production") {
  installDevEventTap();
}

async function sweepCalendarReminders(): Promise<void> {
  const { notify } = await import("@monark/notifications/server");
  const now = new Date();
  const pending = await getPendingReminders(now);
  for (const reminder of pending) {
    const members = await listCalendarMembers({
      organizationId: reminder.organizationId,
      calendarId: reminder.calendarEvent.calendarId,
    });
    const minutesBefore = reminder.minutesBefore;
    const minutesLabel =
      minutesBefore >= 10080
        ? `${minutesBefore / 10080} week${minutesBefore / 10080 !== 1 ? "s" : ""}`
        : minutesBefore >= 1440
          ? `${minutesBefore / 1440} day${minutesBefore / 1440 !== 1 ? "s" : ""}`
          : minutesBefore >= 60
            ? `${minutesBefore / 60} hour${minutesBefore / 60 !== 1 ? "s" : ""}`
            : `${minutesBefore} minute${minutesBefore !== 1 ? "s" : ""}`;
    try {
      for (const member of members) {
        await notify(
          "calendar.event.reminder",
          { userId: member.id },
          {
            eventId: reminder.calendarEventId,
            eventTitle: reminder.calendarEvent.title,
            minutesBefore,
            minutesLabel,
            startAt: reminder.calendarEvent.startAt,
            startAtMs: reminder.calendarEvent.startAt.getTime(),
          },
        );
      }
      await markReminderNotified(reminder.id);
    } catch (err) {
      logger.error({ err, reminderId: reminder.id }, "calendar reminder dispatch failed");
    }
  }
  if (pending.length > 0) {
    logger.info({ count: pending.length }, "calendar reminders dispatched");
  }
}

// Background work that should only fire when this file is the
// process entrypoint — the integration suite imports `app` to drive
// supertest-style requests and doesn't want the worker setInterval
// (would leak handles + log noise) or the bootstrap / flag-sync DB
// writes (the testcontainer provisions its own state).
const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
function startBackgroundWork(): void {
  // Wire the webhook secret resolver BEFORE the worker so the first
  // delivery already has a path to the plaintext secret. The built-in
  // env-var resolver reads `WEBHOOK_SECRETS_JSON` (a JSON map) +
  // per-endpoint `WEBHOOK_SECRET_<endpointId>` env vars ; production
  // deploys that need a managed secret store (AWS Secrets Manager,
  // Vault, etc.) replace this call with their own
  // `setWebhookSecretResolver(...)`. Wiring is done unconditionally
  // — if neither env var is set, the resolver returns null and
  // deliveries record the "no plaintext secret available" error in
  // the admin UI, which is exactly the right surface for the misconfig.
  // See [docs/technical-documentation/webhook-secret-resolver.md](../../docs/technical-documentation/webhook-secret-resolver.md).
  setWebhookSecretResolver(makeEnvVarSecretResolver());

  // Webhook delivery worker drains the outbox on a setInterval. The
  // `/cron/sweep-webhook-deliveries` endpoint below is an external
  // fallback (Vercel Cron, GitHub Actions, k8s CronJob) so a single
  // api crash doesn't strand the outbox.
  startWebhookDeliveryWorker();

  // Automation run worker drains the AutomationRun outbox on a setInterval,
  // executing each enabled automation's graph with retries. Same durable
  // outbox + worker shape as the webhook worker above.
  startAutomationWorker();
  startAchievementsWorker();

  // Provision the shared private bucket that Data Model FILE / ATTACHMENTS
  // fields upload into. Best-effort : a deploy without file storage configured
  // (no SUPABASE_* env) just logs — the bucket is only needed once someone uses
  // a file field, and `files.createUpload` surfaces a clear error until then.
  ensureAchievementIconsBucket().catch((err) =>
    logger.error({ err }, "failed to ensure achievement-icons bucket"),
  );
  ensureDataModelFilesBucket().catch((err) =>
    logger.warn({ err }, "data-model files bucket ensure skipped (storage not configured?)"),
  );

  // Calendar reminder sweep. Runs every 60 s internally; the
  // `/cron/send-calendar-reminders` endpoint is kept as an external
  // fallback for the same reason as the webhook worker above.
  sweepCalendarReminders().catch((err) =>
    logger.error({ err }, "calendar reminder sweep failed at boot"),
  );
  setInterval(() => {
    sweepCalendarReminders().catch((err) =>
      logger.error({ err }, "calendar reminder sweep failed"),
    );
  }, 60_000);

  // Sync the merged flag registry into the FeatureFlag table so the
  // /admin/feature-flags surface can read definitions, and overrides
  // pin to real flag rows. Idempotent — safe to re-run on every boot.
  // Fire-and-forget : a DB hiccup here doesn't block the api process.
  void syncFlagsToDatabase().catch((err) =>
    logger.error({ err }, "syncFlagsToDatabase failed at boot"),
  );

  // Re-hydrate per-model Data Model registrations (RBAC permissions +
  // webhook-subscribable event types) from the DB — the in-memory
  // registries are wiped on restart, and the static `register*` calls
  // above only cover the generic `data-models.*` keys. Fire-and-forget :
  // until this lands, the generic record permissions + admin short-circuit
  // keep record access working. See @monark/data-models registrations.
  void hydrateDataModelRegistrations().catch((err) =>
    logger.error({ err }, "hydrateDataModelRegistrations failed at boot"),
  );
}

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
export async function maybeBootstrapSingletonOrg(): Promise<void> {
  logger.info(
    {
      hasSlug: Boolean(env.INITIAL_ORG_SLUG),
      hasName: Boolean(env.INITIAL_ORG_NAME),
      hasColor: Boolean(env.INITIAL_ORG_PRIMARY_COLOR),
    },
    "Single-tenant bootstrap : evaluating boot-time hook",
  );
  const result = await ensureSingletonOrganizationFromInput({
    slug: env.INITIAL_ORG_SLUG ?? null,
    displayName: env.INITIAL_ORG_NAME ?? null,
    primaryColor: env.INITIAL_ORG_PRIMARY_COLOR ?? null,
    actorId: "system:bootstrap",
  });
  if (result.ok) {
    if (result.created) {
      logger.info(
        { organizationId: result.organizationId, slug: env.INITIAL_ORG_SLUG },
        "Single-tenant bootstrap : created singleton organization",
      );
    } else {
      logger.info(
        { organizationId: result.organizationId },
        "Single-tenant bootstrap : singleton already exists, no-op",
      );
    }
    return;
  }
  const detail = "detail" in result ? result.detail : undefined;
  if (result.reason === "already-multi-tenant") {
    logger.info(
      "Single-tenant bootstrap : tenancy.multi-tenant is ON, skipping env-driven provision",
    );
    return;
  }
  if (result.reason === "env-not-set") {
    logger.warn(
      {
        hasSlug: Boolean(env.INITIAL_ORG_SLUG),
        hasName: Boolean(env.INITIAL_ORG_NAME),
      },
      "Single-tenant bootstrap : INITIAL_ORG_SLUG / INITIAL_ORG_NAME not set, /setup will stay stuck",
    );
    return;
  }
  logger.error(
    { reason: result.reason, detail },
    "Single-tenant bootstrap failed ; /setup will stay stuck",
  );
}

export const app = express();

// Dev-only CORS escape hatch : allow any RFC 1918 / loopback origin so
// a phone (or other LAN device) can hit the api at the developer's
// machine without requiring `WEB_ORIGIN` to be edited per-IP. Matches
// the loopback-rewrite the browser-side tRPC + Supabase clients do for
// the same scenario. Production stays strict (only exact `WEB_ORIGIN`
// entries are allowed) so we don't ship permissive CORS by accident.
const PRIVATE_HOST_RE =
  /^(localhost|127\.0\.0\.1|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

function isAllowedOrigin(origin: string): boolean {
  if (env.WEB_ORIGIN.includes(origin)) return true;
  if (env.NODE_ENV !== "development") return false;
  try {
    const url = new URL(origin);
    return PRIVATE_HOST_RE.test(url.hostname);
  } catch {
    return false;
  }
}

app.use(httpLogger);
app.use(
  cors({
    origin: (origin, callback) => {
      // allow tools / server-to-server calls with no Origin header
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      // In dev, surface the rejection prominently so a developer
      // testing from a LAN device sees why their request was blocked
      // instead of just an opaque 500. Production stays quiet.
      if (env.NODE_ENV === "development") {
        logger.warn(
          { origin, allowList: env.WEB_ORIGIN },
          "CORS rejected non-private origin in dev — add it to WEB_ORIGIN if intentional",
        );
      }
      return callback(new Error(`CORS: origin not allowed: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(
  express.json({
    // Keep the raw bytes so signed-webhook routes (GitHub `X-Hub-Signature-256`)
    // can verify the HMAC over exactly what was sent, not a re-serialization.
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" });
});

// Curated public REST API (/api/v1), authenticated by `@monark/api-keys` and
// gated behind the `public-api.enabled` flag. Mounted before /trpc ; it has its
// own API-key auth + rate-limit middleware and does not share the session
// (Supabase bearer) auth the /trpc surface uses.
mountPublicApi(app);

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
  });
  if (result.ok) return true;
  if (result.reason === "not-configured") {
    logger.error("CRON_SECRET is not configured ; refusing cron request");
    res.status(503).json({ ok: false, error: "not-configured" });
    return false;
  }
  res.status(401).json({ ok: false, error: "unauthorized" });
  return false;
}

app.post("/cron/process-account-deletions", async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  try {
    const result = await processExpiredDeletions();
    logger.info({ ...result }, "processExpiredDeletions sweep complete");
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error({ err: error }, "processExpiredDeletions sweep failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// External fallback for the in-process webhook delivery worker. The
// in-process loop runs every few seconds while the api is healthy ;
// this endpoint exists so a Vercel Cron (or equivalent) can keep the
// outbox draining if every api replica is wedged. Idempotent — the
// worker's `tickOnce()` skips when another tick is in flight.
app.post("/cron/sweep-webhook-deliveries", async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  try {
    const result = await webhookWorkerTick();
    logger.info({ ...result }, "webhook delivery sweep complete");
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error({ err: error }, "webhook delivery sweep failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// Fires pending calendar event reminders. Run every minute via external cron.
// The in-process setInterval in startBackgroundWork() already covers normal
// operation; this endpoint is an external fallback (Vercel Cron, etc.).
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        http://localhost:4000/cron/send-calendar-reminders
app.post("/cron/send-calendar-reminders", async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  try {
    await sweepCalendarReminders();
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, "calendar reminder sweep failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// Enqueues runs for due scheduled (cron-like) automation triggers. The
// in-process worker loop already covers normal operation; this endpoint is an
// external fallback (Vercel Cron, etc.). Run every minute.
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        http://localhost:4000/cron/run-automation-schedules
app.post("/cron/run-automation-schedules", async (req, res) => {
  if (!checkCronSecret(req, res)) return;
  try {
    const result = await runDueSchedules();
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.error({ err: error }, "automation schedule run failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// Inbound HTTP-trigger endpoint. An external system POSTs JSON here to fire an
// automation whose HTTP Trigger secret matches the Bearer token. Unlike the
// cron endpoints (a single global CRON_SECRET), auth is a per-automation secret
// stored on the trigger node ; the handler verifies it in constant time.
//   curl -X POST -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" \
//        -d '{"hello":"world"}' http://localhost:4000/hooks/automation/<id>
app.post("/hooks/automation/:id", async (req, res) => {
  const header = req.header("authorization") ?? "";
  const secret = /^bearer /i.test(header) ? header.slice(7).trim() : null;
  try {
    const result = await handleHttpTrigger({
      automationId: req.params.id,
      secret,
      body: req.body ?? null,
    });
    if (result.status === 202) {
      res.status(202).json({ ok: true, runId: result.runId });
    } else {
      res.status(result.status).json({ ok: false, error: result.error });
    }
  } catch (error) {
    logger.error({ err: error }, "http-trigger handling failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// Inbound GitHub webhooks. Point a repo's webhook (or an org webhook) at
// POST /hooks/github/:org with the secret generated on the /github settings
// page ; the handler verifies `X-Hub-Signature-256` against it, maps the
// delivery to a `github.*` domain event, and emits it (triggering matching
// automations). Unmodeled event types are acked (202) so GitHub doesn't retry.
app.post("/hooks/github/:org", async (req, res) => {
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from("");
  try {
    const result = await handleGithubWebhook({
      organizationId: req.params.org,
      eventName: req.header("x-github-event") ?? "",
      signature: req.header("x-hub-signature-256") ?? null,
      rawBody,
      payload: req.body ?? null,
    });
    if (result.status === 202) {
      res.status(202).json({ ok: true, emitted: result.emitted });
    } else {
      res.status(result.status).json({ ok: false, error: result.error });
    }
  } catch (error) {
    logger.error({ err: error }, "github webhook handling failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// Inbound Telegram updates. The /telegram settings page's Connect registers this
// endpoint with Telegram (`setWebhook`) + a per-org secret ; Telegram echoes that
// secret in `X-Telegram-Bot-Api-Secret-Token` on every update. The handler
// verifies it (constant-time — Telegram signs nothing over the body), maps a
// `message` update to a `telegram.*` domain event, and emits it (triggering
// matching automations). Unmodeled updates are acked (202) so Telegram doesn't
// retry. Telegram doesn't send an event-name header ; the update type is read
// from the payload.
app.post("/hooks/telegram/:org", async (req, res) => {
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from("");
  try {
    const result = await handleTelegramWebhook({
      organizationId: req.params.org,
      eventName: "",
      signature: req.header("x-telegram-bot-api-secret-token") ?? null,
      rawBody,
      payload: req.body ?? null,
    });
    if (result.status === 202) {
      res.status(202).json({ ok: true, emitted: result.emitted });
    } else {
      res.status(result.status).json({ ok: false, error: result.error });
    }
  } catch (error) {
    logger.error({ err: error }, "telegram webhook handling failed");
    res.status(500).json({ ok: false, error: "internal" });
  }
});

// AI chat streaming (Server-Sent Events). The web companion POSTs a message
// here and receives the assistant's reply token-by-token. Auth is the same
// Supabase bearer the /trpc surface uses (via `createContext`); the RBAC + flag
// gates, persistence, and the agent loop all live in `sendMessage`, shared with
// the tRPC `chat.messages.send` mutation — this endpoint only layers on the token
// stream via its `onTextDelta` hook. Kept a dedicated endpoint so the app-wide
// tRPC client (httpBatch-only) doesn't need a subscription link.
function sanitizeChatContext(raw: unknown): ChatMessageContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const route = typeof r.route === "string" ? r.route.slice(0, 200) : undefined;
  const focusRaw =
    r.focus && typeof r.focus === "object" ? (r.focus as Record<string, unknown>) : undefined;
  const focus = focusRaw
    ? {
        model: typeof focusRaw.model === "string" ? focusRaw.model.slice(0, 100) : undefined,
        recordId:
          typeof focusRaw.recordId === "string" ? focusRaw.recordId.slice(0, 100) : undefined,
      }
    : undefined;
  if (!route && !focus?.model && !focus?.recordId) return undefined;
  return { route, focus };
}

app.post("/chat/stream", async (req, res) => {
  const ctx = await createContext({ req, res });
  if (!ctx.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 8000) : "";
  if (!content) {
    res.status(400).json({ error: "content required" });
    return;
  }
  const input = {
    conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
    content,
    context: sanitizeChatContext(body.context),
  };

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const emitEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const result = await sendChatMessage(ctx, input, {
      onTextDelta: (text) => emitEvent("token", { text }),
    });
    emitEvent("done", result);
  } catch (err) {
    const message = err instanceof AppError ? err.message : "internal";
    logger.warn({ err }, "chat stream failed");
    emitEvent("error", { message });
  } finally {
    res.end();
  }
});

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
      const code = error.code;
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
        code === "TOO_MANY_REQUESTS";
      const level = isExpected ? "warn" : "error";
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
      );
      // Report only unhandled / server failures to Sentry (no-op without a
      // DSN) ; expected client errors stay out of the error tracker.
      if (!isExpected) {
        Sentry.captureException(error.cause ?? error, {
          tags: { procedure: path ?? "unknown", procedureType: type, code },
          extra: { requestId: ctx?.requestId, userId: ctx?.userId ?? null },
        });
      }
    },
  }),
);

// Capture unhandled errors from the non-tRPC Express routes (/cron, /hooks,
// /chat/stream, …). No-op unless SENTRY_DSN is set. tRPC errors never reach
// Express (the adapter handles them), so they're captured in its onError hook
// above instead.
Sentry.setupExpressErrorHandler(app);

// Entrypoint guard : `pnpm dev` / `pnpm start` runs this file as the
// process entrypoint and lights up the listen + background work ;
// the integration suite imports `app` to drive supertest-style
// requests and stays inert. The check compares the resolved file URL
// against `process.argv[1]` (which holds the entrypoint script's
// path under both tsx and node).
if (isEntrypoint) {
  void maybeBootstrapSingletonOrg();
  startBackgroundWork();
  // Explicit 0.0.0.0 bind so the api is reachable from other devices
  // on the LAN (phone testing) without depending on Node's IPv4/IPv6
  // dual-stack defaulting. Production deploys behind a reverse proxy
  // don't care which interface we bind to ; the proxy talks to
  // localhost inside the container.
  app.listen(env.PORT, "0.0.0.0", () => {
    logger.info({ port: env.PORT }, "api listening");
  });
}
