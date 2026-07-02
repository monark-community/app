import { z } from "zod";
import { emit, listEventTypesByModule, NotFoundError, ValidationError } from "@monark/common";
import { publicProcedure, router } from "@monark/common/trpc";
import { requirePermission } from "@monark/rbac/server";
import type {
  WebhookEndpointCreatedEvent,
  WebhookEndpointDeletedEvent,
  WebhookEndpointSecretRotatedEvent,
  WebhookEndpointUpdatedEvent,
} from "../contracts/events";
import {
  createEndpoint,
  deleteEndpoint,
  findDeliveryById,
  findEndpointById,
  listAttemptsForDelivery,
  listDeliveriesForEndpoint,
  listEndpointsForOrg,
  requeueDelivery,
  rotateEndpointSecret,
  updateEndpointPatch,
} from "./data";
import { mintSecret } from "./secrets";
import { forgetSecret, rememberSecret } from "./secret-store";
import { deliverOne } from "./worker";

// Same private-host shape the api's CORS layer accepts in dev so
// loopback + RFC 1918 ranges (10/8, 172.16/12, 192.168/16) get the
// same treatment for webhook URLs as for cross-origin browser calls
// during local development.
const PRIVATE_HOST_RE =
  /^(localhost|127\.0\.0\.1|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

const subscriptionInputSchema = z.object({
  eventType: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9._-]*$/, "invalid_event_type"),
  isPrefix: z.boolean().optional().default(false),
});

/**
 * Validates the webhook target URL :
 *
 *   - `https://` is always accepted (production-safe).
 *   - `http://` is accepted **only** in non-production AND only when
 *     the host is loopback or RFC 1918 private. Lets local dev
 *     register endpoints against the mock receiver
 *     (`http://127.0.0.1:4123/hook`) or a sibling docker service
 *     without standing up a TLS proxy. The same restriction the
 *     api's CORS layer uses for dev origins so the rules don't
 *     diverge.
 *   - Anything else (file://, ws://, plain http to a public host,
 *     missing scheme, malformed URL) is rejected.
 *
 * `NODE_ENV` is read directly from `process.env` so this single
 * helper doesn't drag a zod-validated env wrapper into a downstream
 * package. Production deploys MUST set `NODE_ENV=production` (every
 * existing CORS / cookie / log path already assumes this).
 */
function assertSafeUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError(
      "Webhook URL must be an absolute https:// URL (http:// is allowed only for private/loopback hosts in development).",
    );
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:") {
    if (process.env.NODE_ENV === "production") {
      throw new ValidationError("Webhook URL must be https:// in production.");
    }
    if (PRIVATE_HOST_RE.test(parsed.hostname)) return;
    throw new ValidationError(
      "Webhook URL over http:// is allowed in development only for loopback or private (RFC 1918) hosts. Use https:// for public targets.",
    );
  }
  throw new ValidationError(
    `Webhook URL scheme "${parsed.protocol}" is not supported ; use https:// (or http:// for a private host in development).`,
  );
}

export const webhooksRouter = router({
  // Returns every domain event type the platform emits, grouped by
  // the module that registered it. The admin UI's subscription
  // picker iterates this so operators check boxes against named
  // events instead of guessing type strings. Open to anyone with
  // `webhooks.read` since the metadata is non-sensitive.
  listEventTypes: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) {
      // Non-authed callers don't even see the metadata. Soft-fail
      // with empty groups rather than throwing — keeps the picker
      // graceful during a brief auth refresh.
      return {
        groups: [] as Array<{
          module: string;
          events: Array<{ type: string; description: string }>;
        }>,
      };
    }
    return {
      groups: listEventTypesByModule().map((g) => ({
        module: g.module,
        events: g.events.map((e) => ({
          type: e.type,
          description: e.description,
        })),
      })),
    };
  }),

  // List endpoints in scope. Org-scoped callers see their org's
  // endpoints ; sysadmins listing platform-tier endpoints pass
  // `organizationId: null`.
  list: publicProcedure
    .input(
      z.object({
        organizationId: z.string().min(1).nullable(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requirePermission(ctx, "webhooks.read", input.organizationId ?? undefined);
      return listEndpointsForOrg(input.organizationId);
    }),

  get: publicProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ ctx, input }) => {
    const endpoint = await findEndpointById(input.id);
    if (!endpoint) throw new NotFoundError("WebhookEndpoint", input.id);
    await requirePermission(ctx, "webhooks.read", endpoint.organizationId ?? undefined);
    return endpoint;
  }),

  // Returns the freshly-minted plaintext secret in the response so
  // the operator can configure their receiver. The secret is never
  // returned again ; rotate to issue a new one.
  create: publicProcedure
    .input(
      z.object({
        organizationId: z.string().min(1).nullable(),
        name: z.string().trim().min(1).max(80),
        url: z.string(),
        description: z.string().trim().max(280).nullable().optional(),
        subscriptions: z.array(subscriptionInputSchema).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorId = await requirePermission(
        ctx,
        "webhooks.write",
        input.organizationId ?? undefined,
      );
      assertSafeUrl(input.url);
      const { plaintext, hash } = mintSecret();
      const endpoint = await createEndpoint({
        organizationId: input.organizationId,
        name: input.name,
        url: input.url,
        description: input.description ?? null,
        secretHash: hash,
        subscriptions: input.subscriptions.map((s) => ({
          eventType: s.eventType,
          isPrefix: s.isPrefix,
        })),
      });
      // Persist the plaintext to the active SecretStore so the worker
      // can sign deliveries. Default in-memory ; production replaces
      // via `setWebhookSecretStore()` at api boot.
      await rememberSecret(endpoint.id, plaintext);
      const event: WebhookEndpointCreatedEvent = {
        type: "webhook.endpoint-created",
        endpointId: endpoint.id,
        organizationId: endpoint.organizationId,
        url: endpoint.url,
        actorId,
        occurredAt: new Date(),
      };
      await emit(event).catch(() => {});
      return { endpoint, secret: plaintext };
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(80).optional(),
        url: z.string().optional(),
        description: z.string().trim().max(280).nullable().optional(),
        status: z.enum(["active", "disabled"]).optional(),
        disabledReason: z.string().trim().max(280).nullable().optional(),
        subscriptions: z.array(subscriptionInputSchema).max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await findEndpointById(input.id);
      if (!existing) throw new NotFoundError("WebhookEndpoint", input.id);
      const actorId = await requirePermission(
        ctx,
        "webhooks.write",
        existing.organizationId ?? undefined,
      );
      if (input.url !== undefined) assertSafeUrl(input.url);
      const updated = await updateEndpointPatch({
        id: input.id,
        name: input.name,
        url: input.url,
        description: input.description,
        status: input.status,
        disabledReason: input.disabledReason,
        subscriptions: input.subscriptions,
      });
      const changed: WebhookEndpointUpdatedEvent["changed"] = [];
      if (input.name !== undefined && input.name !== existing.name) {
        changed.push("name");
      }
      if (input.url !== undefined && input.url !== existing.url) changed.push("url");
      if (input.description !== undefined) changed.push("description");
      if (input.status !== undefined && input.status !== existing.status) {
        changed.push("status");
      }
      if (input.subscriptions !== undefined) changed.push("subscriptions");
      if (changed.length > 0) {
        const event: WebhookEndpointUpdatedEvent = {
          type: "webhook.endpoint-updated",
          endpointId: updated.id,
          organizationId: updated.organizationId,
          changed,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event).catch(() => {});
      }
      return updated;
    }),

  rotateSecret: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await findEndpointById(input.id);
      if (!existing) throw new NotFoundError("WebhookEndpoint", input.id);
      const actorId = await requirePermission(
        ctx,
        "webhooks.write",
        existing.organizationId ?? undefined,
      );
      const { plaintext, hash } = mintSecret();
      await rotateEndpointSecret({ id: input.id, secretHash: hash });
      await rememberSecret(input.id, plaintext);
      const event: WebhookEndpointSecretRotatedEvent = {
        type: "webhook.endpoint-secret-rotated",
        endpointId: input.id,
        organizationId: existing.organizationId,
        actorId,
        occurredAt: new Date(),
      };
      await emit(event).catch(() => {});
      return { secret: plaintext };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await findEndpointById(input.id);
      if (!existing) return;
      const actorId = await requirePermission(
        ctx,
        "webhooks.write",
        existing.organizationId ?? undefined,
      );
      await deleteEndpoint(input.id);
      await forgetSecret(input.id);
      const event: WebhookEndpointDeletedEvent = {
        type: "webhook.endpoint-deleted",
        endpointId: existing.id,
        organizationId: existing.organizationId,
        actorId,
        occurredAt: new Date(),
      };
      await emit(event).catch(() => {});
    }),

  // ── Delivery inspection + manual retry ────────────────────────

  listDeliveries: publicProcedure
    .input(
      z.object({
        endpointId: z.string().min(1),
        limit: z.number().int().min(1).max(100).optional().default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const endpoint = await findEndpointById(input.endpointId);
      if (!endpoint) throw new NotFoundError("WebhookEndpoint", input.endpointId);
      await requirePermission(ctx, "webhooks.read", endpoint.organizationId ?? undefined);
      return listDeliveriesForEndpoint({
        endpointId: input.endpointId,
        limit: input.limit,
        cursor: input.cursor,
      });
    }),

  getDelivery: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const delivery = await findDeliveryById(input.id);
      if (!delivery) throw new NotFoundError("WebhookDelivery", input.id);
      await requirePermission(ctx, "webhooks.read", delivery.endpoint.organizationId ?? undefined);
      const attempts = await listAttemptsForDelivery(input.id);
      // Flatten the Prisma `Json` payload to `unknown` at the wire
      // boundary so the tRPC client doesn't carry the recursive
      // `JsonValue` generic (TS2589 fires on the consuming page when
      // it tries to materialize the resulting deep type).
      const { payload, ...rest } = delivery;
      return {
        delivery: { ...rest, payload: payload as unknown },
        attempts,
      };
    }),

  retryDelivery: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const delivery = await findDeliveryById(input.id);
      if (!delivery) throw new NotFoundError("WebhookDelivery", input.id);
      await requirePermission(ctx, "webhooks.retry", delivery.endpoint.organizationId ?? undefined);
      // Reset to pending so the worker picks it up on the next tick ;
      // we also kick off one attempt inline so the operator gets
      // immediate feedback in the UI without waiting for the
      // setInterval cadence.
      await requeueDelivery(input.id);
      const refreshed = await findDeliveryById(input.id);
      if (refreshed) await deliverOne(refreshed);
    }),
});
