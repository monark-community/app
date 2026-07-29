import { z } from "zod";
import {
  emit,
  eventFieldsFor,
  listEventTypesByModule,
  NotFoundError,
  orgVisibleEventTypes,
  UnauthorizedError,
  ValidationError,
} from "@monark/common";
import { MAX_PAGE_SIZE } from "@monark/common/pagination";
import { publicProcedure, router } from "@monark/common/trpc";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import { listSecrets } from "@monark/secrets/server";
import { automationGraphSchema, parseGraph, type AutomationGraph } from "../contracts/graph";
import { validateGraph, type GraphIssue } from "../contracts/validate";
import {
  HTTP_TRIGGER_EVENT,
  HTTP_TRIGGER_TYPE,
  MANUAL_TRIGGER_EVENT,
  MANUAL_TRIGGER_TYPE,
  SCHEDULE_TRIGGER_EVENT,
  SCHEDULE_TRIGGER_TYPE,
} from "../contracts/triggers";
import { generateHttpSecret } from "./http-trigger";
import type {
  AutomationCreatedEvent,
  AutomationDeletedEvent,
  AutomationUpdatedEvent,
} from "../contracts/events";
import {
  createAutomation,
  createPendingRun,
  findAutomationById,
  findAutomationRunById,
  listAutomationRuns,
  listAutomations,
  listOrgMembers,
  serializeAutomation,
  softDeleteAutomation,
  restoreAutomation,
  updateAutomation,
  type AutomationRunRow,
  type AutomationRunWithSteps,
} from "./data";
import { getAutomationNode, listAutomationNodeDescriptors } from "./registry";
import { sampleTriggerPayload } from "./sample-payload";

const paginationInput = {
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).nullish(),
};

// Runs carry Json columns (triggerPayload/output, and per-step input/output).
// Cast them to `unknown` on the way out so tRPC returns typed-but-opaque JSON
// rather than Prisma's deep `JsonValue` (which risks TS2589).
function serializeRun(row: AutomationRunRow) {
  return { ...row, triggerPayload: row.triggerPayload as unknown, output: row.output as unknown };
}
function serializeRunWithSteps(row: AutomationRunWithSteps) {
  return {
    ...serializeRun(row),
    steps: row.steps.map((s) => ({
      ...s,
      input: s.input as unknown,
      output: s.output as unknown,
      logs: s.logs as unknown,
    })),
  };
}

/** Load an automation and assert it belongs to the caller's org (else 404). */
async function requireOwnedAutomation(id: string, organizationId: string) {
  const automation = await findAutomationById(id);
  if (!automation || automation.organizationId !== organizationId || automation.deletedAt) {
    throw new NotFoundError("Automation", id);
  }
  return automation;
}

/** Render a validation error into a short, human-readable line for the caller. */
function describeIssue(graph: AutomationGraph, issue: GraphIssue): string {
  const node = graph.nodes.find((n) => n.id === issue.nodeId);
  const desc = node ? getAutomationNode(node.type)?.node.descriptor : undefined;
  const nodeLabel = node?.name?.trim() || desc?.label || node?.type || "A node";
  const fieldLabel =
    desc?.configFields.find((f) => f.key === issue.fieldKey)?.label ?? issue.fieldKey ?? "";
  switch (issue.code) {
    case "no-trigger":
      return "Add a trigger node to start the flow.";
    case "multiple-triggers":
      return `${nodeLabel}: a flow can only have one trigger.`;
    case "trigger-no-event":
      return `${nodeLabel}: select the event that fires this automation.`;
    case "missing-required":
      return `${nodeLabel}: "${fieldLabel}" is required (fill it in or wire an input).`;
    case "unknown-node":
      return `${nodeLabel}: unknown node type.`;
    case "cycle":
      return "The graph has a loop, which can't be run.";
    default:
      return `${nodeLabel}: invalid configuration.`;
  }
}

/**
 * The `triggerEventType` an automation should store, derived from its graph's
 * trigger node: a bus-ignored sentinel for a manual / HTTP trigger, else the
 * event trigger's chosen event. Falls back to the caller's value when there's no
 * trigger yet (a work-in-progress graph).
 */
function resolveTriggerEventType(
  graph: AutomationGraph,
  fallback: string | undefined,
): string | undefined {
  const trigger = graph.nodes.find(
    (n) => getAutomationNode(n.type)?.node.descriptor.kind === "trigger",
  );
  if (!trigger) return fallback;
  if (trigger.type === MANUAL_TRIGGER_TYPE) return MANUAL_TRIGGER_EVENT;
  if (trigger.type === HTTP_TRIGGER_TYPE) return HTTP_TRIGGER_EVENT;
  if (trigger.type === SCHEDULE_TRIGGER_TYPE) return SCHEDULE_TRIGGER_EVENT;
  const ev = trigger.config.eventType;
  return typeof ev === "string" && ev.trim() !== "" ? ev : fallback;
}

/**
 * Pre-flight guard: block a run when the graph has blocking (error) issues, with
 * an itemized message. Warnings (e.g. orphan nodes) don't block. Shared with the
 * editor's pre-flight via `validateGraph`.
 */
function assertRunnable(graph: AutomationGraph, triggerEventType: string | null): void {
  const errors = validateGraph(graph, (type) => getAutomationNode(type)?.node.descriptor, {
    triggerEventType,
  }).filter((i) => i.severity === "error");
  if (errors.length === 0) return;
  const lines = errors.map((e) => `• ${describeIssue(graph, e)}`);
  throw new ValidationError(`This automation can't run yet:\n${lines.join("\n")}`, errors);
}

const automationsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        includeDeleted: z.boolean().optional(),
        ...paginationInput,
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "automation.view", org.id);
      const page = await listAutomations({ organizationId: org.id, ...input });
      return { ...page, items: page.items.map(serializeAutomation) };
    }),

  // Name search for the global command palette — scoped to the caller's org and
  // gated by `automation.view`. Returns a light `{ id, name }` shape (no graph).
  search: publicProcedure
    .input(z.object({ query: z.string().min(2).max(200) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "automation.view", org.id);
      const page = await listAutomations({
        organizationId: org.id,
        search: input.query,
        limit: 10,
      });
      return page.items.map((a) => ({ id: a.id, name: a.name }));
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "automation.view", org.id);
      return serializeAutomation(await requireOwnedAutomation(input.id, org.id));
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().max(2000).nullish(),
        // Optional: a new automation seeds a trigger node and the editor sets
        // the event type on save.
        triggerEventType: z.string().trim().max(120).optional(),
        graph: automationGraphSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "automation.create", org.id);
      const row = await createAutomation({
        organizationId: org.id,
        name: input.name,
        description: input.description ?? null,
        triggerEventType: input.graph
          ? resolveTriggerEventType(input.graph, input.triggerEventType)
          : input.triggerEventType,
        graph: input.graph,
        createdBy: actorId,
      });
      await emit<AutomationCreatedEvent>({
        type: "automation.created",
        automationId: row.id,
        organizationId: org.id,
        name: row.name,
        actorId,
        occurredAt: new Date(),
      }).catch(() => {});
      return serializeAutomation(row);
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().max(2000).nullish(),
        triggerEventType: z.string().trim().min(1).max(120).optional(),
        graph: automationGraphSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "automation.create", org.id);
      await requireOwnedAutomation(input.id, org.id);
      const row = await updateAutomation(input.id, {
        name: input.name,
        description: input.description,
        triggerEventType: input.graph
          ? resolveTriggerEventType(input.graph, input.triggerEventType)
          : input.triggerEventType,
        graph: input.graph,
      });
      await emit<AutomationUpdatedEvent>({
        type: "automation.updated",
        automationId: row.id,
        organizationId: org.id,
        actorId,
        occurredAt: new Date(),
      }).catch(() => {});
      return serializeAutomation(row);
    }),

  setEnabled: publicProcedure
    .input(z.object({ id: z.string().min(1), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "automation.manage", org.id);
      await requireOwnedAutomation(input.id, org.id);
      const row = await updateAutomation(input.id, { enabled: input.enabled });
      await emit<AutomationUpdatedEvent>({
        type: "automation.updated",
        automationId: row.id,
        organizationId: org.id,
        actorId,
        occurredAt: new Date(),
      }).catch(() => {});
      return serializeAutomation(row);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      const actorId = await requirePermission(ctx, "automation.manage", org.id);
      await requireOwnedAutomation(input.id, org.id);
      await softDeleteAutomation(input.id);
      await emit<AutomationDeletedEvent>({
        type: "automation.deleted",
        automationId: input.id,
        organizationId: org.id,
        actorId,
        occurredAt: new Date(),
      }).catch(() => {});
      return { id: input.id };
    }),

  restore: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "automation.manage", org.id);
      // A soft-deleted automation isn't "owned-visible" via requireOwnedAutomation
      // (it filters deletedAt) ; check ownership directly.
      const automation = await findAutomationById(input.id);
      if (!automation || automation.organizationId !== org.id) {
        throw new NotFoundError("Automation", input.id);
      }
      await restoreAutomation(input.id);
      return { id: input.id };
    }),

  runNow: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "automation.run", org.id);
      const automation = await requireOwnedAutomation(input.id, org.id);
      // Pre-flight: refuse to enqueue a misconfigured graph, with a clear reason.
      assertRunnable(parseGraph(automation.graph), automation.triggerEventType);
      const run = await createPendingRun({
        automationId: automation.id,
        organizationId: org.id,
        triggerEventType: automation.triggerEventType,
        // Synthetic trigger payload shaped like the real event, with a
        // placeholder per declared field so `{{ trigger.* }}` references resolve
        // during a test instead of coming back undefined.
        triggerPayload: sampleTriggerPayload(automation.triggerEventType, {
          organizationId: org.id,
          actorId: ctx.userId,
        }),
        manual: true,
        createdBy: automation.createdBy,
      });
      return { runId: run.id };
    }),

  // Mint a fresh HTTP-trigger secret (server-side randomness). The editor stores
  // it in the trigger node's config and persists it on the next save.
  newHttpSecret: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "automation.create", org.id);
    return { secret: generateHttpSecret() };
  }),
});

const runsRouter = router({
  list: publicProcedure
    .input(z.object({ automationId: z.string().min(1).optional(), ...paginationInput }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "automation.view", org.id);
      const page = await listAutomationRuns({ organizationId: org.id, ...input });
      return { ...page, items: page.items.map(serializeRun) };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      await requirePermission(ctx, "automation.view", org.id);
      const run = await findAutomationRunById(input.id);
      if (!run || run.organizationId !== org.id) throw new NotFoundError("AutomationRun", input.id);
      return serializeRunWithSteps(run);
    }),
});

const nodeTypesRouter = router({
  // Palette descriptors for the editor (serializable half only — no execute).
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "automation.view", org.id);
    return { nodes: listAutomationNodeDescriptors() };
  }),
});

const eventTypesRouter = router({
  // Trigger-node picker: every registered event type, grouped by module, with
  // per-org visibility applied (same logic as the webhooks subscription picker).
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "automation.view", org.id);
    const visible = await orgVisibleEventTypes(ctx.activeOrganizationId);
    return {
      groups: listEventTypesByModule().map((g) => ({
        module: g.module,
        events: g.events
          .filter((e) => (e.orgScoped ? visible.has(e.type) : true))
          // `fields` (payload fields + common base) drive the trigger node's
          // discoverable outputs in the editor, so authors see what each event
          // exposes for `{{ trigger.* }}`.
          .map((e) => ({
            type: e.type,
            description: e.description,
            fields: eventFieldsFor(e.type),
          })),
      })),
    };
  }),
});

const membersRouter = router({
  // Active org members, for the editor's user-picker config fields.
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "automation.view", org.id);
    return { members: await listOrgMembers(org.id) };
  }),
});

const secretsRouter = router({
  // `secret` config-field picker: the NAMES of the org's secrets, so an author
  // can reference one without ever seeing a value. Gated on `automation.view`
  // (not `secrets.read`) — picking a secret to wire into a node is part of
  // editing an automation, and the value is never exposed here anyway.
  list: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "automation.view", org.id);
    const secrets = await listSecrets(org.id);
    return { names: secrets.map((s) => s.key) };
  }),
});

export const automationRouter = router({
  automations: automationsRouter,
  runs: runsRouter,
  nodeTypes: nodeTypesRouter,
  eventTypes: eventTypesRouter,
  members: membersRouter,
  secrets: secretsRouter,
});
