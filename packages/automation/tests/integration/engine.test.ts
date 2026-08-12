import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { getDb } from "@monark/db";
import { emit } from "@monark/common";
import { listSecrets, setSecret } from "@monark/secrets/server";
import type { DomainEvent } from "@monark/common/contracts/events";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import { createDataModel, createDataRecord } from "@monark/data-models/server";
import { createAutomation, createPendingRun } from "../../src/server/data";
import { handleHttpTrigger } from "../../src/server/http-trigger";
import { runDueSchedules } from "../../src/server/scheduler";
import { registerAutomationPermissions } from "../../src/server/permissions";
import { registerBuiltinAutomationNodes } from "../../src/server/nodes";
import {
  defineNode,
  registerAutomationNodes,
  _resetAutomationNodesForTesting,
} from "../../src/server/registry";
import { registerAutomationSubscribers } from "../../src/server/subscriber";
import { automationTick } from "../../src/server/worker";
import { automationRouter } from "../../src/server/router";
import type { AutomationGraph } from "../../src/contracts/graph";

// End-to-end automation slice against a real Postgres: a graph of
// event-trigger -> echo runs both via a manual "run now" and via a matching
// domain event fanned through the wildcard subscriber, and the run + per-node
// steps are recorded. Also proves the RBAC deny path on create.

const ORG = "auto-it-org";
const U_ADMIN = "auto-it-admin"; // built-in ADMIN (short-circuits every permission)
const U_MEMBER = "auto-it-member"; // org member, no role
const ADMIN_BUILTIN_ID = "role_admin_builtin"; // migration-seeded built-in ADMIN row

const createCaller = t.createCallerFactory(automationRouter);
const callerFor = (userId: string, orgId: string | null) =>
  createCaller({ userId, activeOrganizationId: orgId, requestId: "auto-it" });

/** Drain the run outbox fully (repeat until a tick processes nothing). */
async function drain(): Promise<void> {
  for (let i = 0; i < 25; i++) {
    const { processed } = await automationTick(200);
    if (processed === 0) break;
  }
}

const GRAPH: AutomationGraph = {
  nodes: [
    {
      id: "n1",
      type: "automation.event-trigger",
      position: { x: 0, y: 0 },
      config: { eventType: "data-models.record-created" },
    },
    {
      id: "n2",
      type: "test.echo",
      position: { x: 200, y: 0 },
      config: { message: "hi {{ trigger.type }}" },
    },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
};

beforeAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [U_ADMIN, U_MEMBER] } } });

  // The secrets store loads this lazily; set a valid 32-byte key so
  // `ctx.getSecret` can decrypt in the read-secret spec.
  process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("hex");

  registerAutomationPermissions();

  // Known node set: the built-ins plus a deterministic echo node (no external
  // effects) so the engine + interpolation are exercised without network/notify.
  _resetAutomationNodesForTesting();
  registerBuiltinAutomationNodes();
  registerAutomationNodes("test", {
    echo: defineNode({
      descriptor: {
        kind: "action",
        category: "test",
        label: "Echo",
        inputs: [{ id: "in" }],
        outputs: [{ id: "out" }],
        configFields: [{ key: "message", label: "Message", type: "text" }],
      },
      configSchema: z.object({ message: z.string() }),
      execute: (_ctx, config) => Promise.resolve({ echoed: config.message }),
    }),
    // Emits an object output, for testing linkable-field data flow.
    payload: defineNode({
      descriptor: {
        kind: "action",
        category: "test",
        label: "Payload",
        inputs: [{ id: "in" }],
        outputs: [{ id: "out" }],
        configFields: [],
      },
      configSchema: z.object({}),
      execute: () => Promise.resolve({ title: "linked title" }),
    }),
    // Two config fields, echoed back — for testing one source wired into many.
    two: defineNode({
      descriptor: {
        kind: "action",
        category: "test",
        label: "Two",
        inputs: [{ id: "in" }],
        outputs: [{ id: "out" }],
        configFields: [
          { key: "a", label: "A", type: "text" },
          { key: "b", label: "B", type: "text" },
        ],
      },
      configSchema: z.object({ a: z.unknown(), b: z.unknown() }),
      execute: (_ctx, config) => Promise.resolve({ a: config.a, b: config.b }),
    }),
    // Reads an org secret by NAME via ctx.getSecret. Returns only the resolved
    // value's length (never the value) so the spec can prove decryption worked
    // without the plaintext ever leaving the node.
    readsecret: defineNode({
      descriptor: {
        kind: "action",
        category: "test",
        label: "Read secret",
        inputs: [{ id: "in" }],
        outputs: [{ id: "out" }],
        configFields: [{ key: "secretName", label: "Secret", type: "secret" }],
      },
      configSchema: z.object({ secretName: z.string() }),
      execute: async (ctx, config) => {
        const value = await ctx.getSecret(config.secretName);
        return { length: value?.length ?? null };
      },
    }),
    // Emits log lines via `ctx.log` — for testing per-step log persistence.
    logger: defineNode({
      descriptor: {
        kind: "action",
        category: "test",
        label: "Logger",
        inputs: [{ id: "in" }],
        outputs: [{ id: "out" }],
        configFields: [],
      },
      configSchema: z.object({}),
      execute: (ctx) => {
        ctx.log("first line");
        ctx.log("second line", "warn");
        return Promise.resolve({ ok: true });
      },
    }),
    // Emits a fixed array output — the source list for a For-Each loop test.
    list: defineNode({
      descriptor: {
        kind: "action",
        category: "test",
        label: "List",
        inputs: [{ id: "in" }],
        outputs: [{ id: "out" }],
        configFields: [],
      },
      configSchema: z.object({}),
      execute: () => Promise.resolve({ items: ["alpha", "beta", "gamma"] }),
    }),
  });

  // One automation handler on the bus for the emit-based specs. The bus is
  // otherwise empty in this suite, so a single registration is exactly one.
  registerAutomationSubscribers();

  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  for (const id of [U_ADMIN, U_MEMBER]) {
    await db.user.create({ data: { id, email: `${id}@test.local` } });
    await db.organizationMembership.create({ data: { userId: id, organizationId: ORG } });
  }
  await assignRole({
    userId: U_ADMIN,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
});

afterAll(async () => {
  const db = getDb();
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: { in: [U_ADMIN, U_MEMBER] } } });
});

describe("automation — manual run", () => {
  it("runs the graph end-to-end and records a step per node", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "Echo flow",
      triggerEventType: "data-models.record-created",
      graph: GRAPH,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps.length).toBe(2);
    const echoStep = run.steps.find((s) => s.nodeId === "n2");
    // The trigger payload's `type` is interpolated into the echo message.
    expect(echoStep?.output).toEqual({ echoed: "hi data-models.record-created" });
  });

  it("persists a node's ctx.log lines (in order, with levels) on its step", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "Logger flow",
      triggerEventType: "data-models.record-created",
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.event-trigger",
            position: { x: 0, y: 0 },
            config: { eventType: "data-models.record-created" },
          },
          { id: "lg", type: "test.logger", position: { x: 200, y: 0 }, config: {} },
        ],
        edges: [{ id: "e", source: "t", target: "lg" }],
      },
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    const step = run.steps.find((s) => s.nodeId === "lg");
    const logs = step?.logs as
      | Array<{ level: string; message: string; ts: string }>
      | null
      | undefined;
    expect(logs?.map((l) => l.message)).toEqual(["first line", "second line"]);
    expect(logs?.[1]?.level).toBe("warn");
    expect(typeof logs?.[0]?.ts).toBe("string");
  });

  it("For-Each runs the body once per item, then continues on `done`", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "For-each flow",
      triggerEventType: "data-models.record-created",
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.event-trigger",
            position: { x: 0, y: 0 },
            config: { eventType: "data-models.record-created" },
            slug: "trigger",
          },
          { id: "lst", type: "test.list", position: { x: 200, y: 0 }, config: {}, slug: "list" },
          {
            id: "fe",
            type: "automation.for-each",
            position: { x: 400, y: 0 },
            config: { items: "{{ steps.list.items }}" },
            slug: "fe",
          },
          {
            id: "body",
            type: "test.echo",
            position: { x: 600, y: 0 },
            config: { message: "item {{ steps.fe.item }} @ {{ steps.fe.index }}" },
            slug: "body",
          },
          {
            id: "after",
            type: "test.echo",
            position: { x: 600, y: 200 },
            config: { message: "done {{ steps.fe.count }}" },
            slug: "after",
          },
        ],
        edges: [
          { id: "e1", source: "t", target: "lst", sourceHandle: "out", targetHandle: "in" },
          { id: "e2", source: "lst", target: "fe", sourceHandle: "out", targetHandle: "in" },
          { id: "e3", source: "fe", target: "body", sourceHandle: "each", targetHandle: "in" },
          { id: "e4", source: "fe", target: "after", sourceHandle: "done", targetHandle: "in" },
        ],
      },
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");

    // Body ran once per item, in order, with the current item + index in scope.
    const bodySteps = run.steps
      .filter((s) => s.nodeId === "body")
      .sort((a, b) => a.sequence - b.sequence);
    expect(bodySteps.map((s) => (s.output as { echoed: string }).echoed)).toEqual([
      "item alpha @ 0",
      "item beta @ 1",
      "item gamma @ 2",
    ]);

    // The For-Each node's output carries the item count + a result per iteration.
    const feStep = run.steps.find((s) => s.nodeId === "fe");
    const feOut = feStep?.output as { count: number; results: unknown[] };
    expect(feOut.count).toBe(3);
    expect(feOut.results).toHaveLength(3);

    // The `done` branch runs after the loop, with the count available.
    const afterStep = run.steps.find((s) => s.nodeId === "after");
    expect((afterStep?.output as { echoed: string }).echoed).toBe("done 3");
  });

  it("resolves an org secret via ctx.getSecret, stamps lastUsedAt, and never persists the value", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    // Seed a secret directly in this org's store (write-only path).
    await setSecret({
      organizationId: ORG,
      key: "MY_TOKEN",
      value: "s3cr3t-value",
      createdBy: U_ADMIN,
    });

    const created = await admin.automations.create({
      name: "Secret flow",
      triggerEventType: "data-models.record-created",
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.event-trigger",
            position: { x: 0, y: 0 },
            config: { eventType: "data-models.record-created" },
          },
          {
            id: "rs",
            type: "test.readsecret",
            position: { x: 200, y: 0 },
            config: { secretName: "MY_TOKEN" },
          },
        ],
        edges: [{ id: "e", source: "t", target: "rs" }],
      },
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    const step = run.steps.find((s) => s.nodeId === "rs");
    // The node decrypted the value (length matches) but only its length surfaced.
    expect(step?.output).toEqual({ length: "s3cr3t-value".length });
    // The persisted step input holds the secret's NAME, never its value.
    expect(step?.input).toEqual({ secretName: "MY_TOKEN" });
    expect(JSON.stringify(run)).not.toContain("s3cr3t-value");
    // Reading the secret stamped lastUsedAt.
    const summary = (await listSecrets(ORG)).find((s) => s.key === "MY_TOKEN");
    expect(summary?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("returns null from ctx.getSecret for an unknown secret name", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "Missing secret flow",
      triggerEventType: "data-models.record-created",
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.event-trigger",
            position: { x: 0, y: 0 },
            config: { eventType: "data-models.record-created" },
          },
          {
            id: "rs",
            type: "test.readsecret",
            position: { x: 200, y: 0 },
            config: { secretName: "DOES_NOT_EXIST" },
          },
        ],
        edges: [{ id: "e", source: "t", target: "rs" }],
      },
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps.find((s) => s.nodeId === "rs")?.output).toEqual({ length: null });
  });
});

describe("automation — event trigger", () => {
  it("enqueues and runs when a matching event fires", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "Evt flow",
      triggerEventType: "data-models.record-created",
      graph: GRAPH,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    await emit({
      type: "data-models.record-created",
      organizationId: ORG,
      actorId: U_ADMIN,
      dataModelId: "m1",
      dataModelKey: "m",
      recordId: "r1",
      occurredAt: new Date(),
    } as unknown as DomainEvent);
    await drain();

    const runs = await admin.runs.list({ automationId: created.id });
    expect(runs.items.length).toBeGreaterThanOrEqual(1);
    expect(runs.items[0]?.status).toBe("SUCCEEDED");
  });

  it("does not enqueue a run for a non-matching event type", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "Kanban-triggered",
      triggerEventType: "kanban.card-created",
      graph: GRAPH,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    // A user-tied event resolves to the user's orgs but matches no automation
    // whose triggerEventType is this type.
    await emit({
      type: "user.signed-in",
      userId: U_ADMIN,
      occurredAt: new Date(),
    } as unknown as DomainEvent);
    await drain();

    const runs = await admin.runs.list({ automationId: created.id });
    expect(runs.items.length).toBe(0);
  });
});

describe("automation — find records + user profile nodes", () => {
  it("finds records by a field filter (Find Records node)", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const model = await createDataModel({
      organizationId: ORG,
      key: "auto-find",
      name: "Auto Find",
      createdBy: U_ADMIN,
    });
    await createDataRecord({
      dataModelId: model.id,
      data: { title: "findme" },
      createdBy: U_ADMIN,
    });
    const graph = {
      nodes: [
        {
          id: "t",
          type: "automation.event-trigger",
          position: { x: 0, y: 0 },
          config: { eventType: "data-models.record-created" },
        },
        {
          id: "f",
          type: "automation.data-find-records",
          position: { x: 200, y: 0 },
          config: { modelKey: "auto-find", field: "title", match: "contains", value: "findme" },
        },
      ],
      edges: [{ id: "e1", source: "t", target: "f" }],
    };
    const created = await admin.automations.create({
      name: "Finder",
      triggerEventType: "data-models.record-created",
      graph,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });
    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    const step = run.steps.find((s) => s.nodeType === "automation.data-find-records");
    const out = step?.output as { count?: number; records?: Array<{ title: string }> } | undefined;
    expect(out?.count).toBeGreaterThanOrEqual(1);
    expect(out?.records?.some((r) => r.title === "findme")).toBe(true);
  });

  it("updates a user's profile (Update User Profile node)", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const graph = {
      nodes: [
        {
          id: "t",
          type: "automation.event-trigger",
          position: { x: 0, y: 0 },
          config: { eventType: "data-models.record-created" },
        },
        {
          id: "u",
          type: "automation.user-update-profile",
          position: { x: 200, y: 0 },
          config: { userId: U_MEMBER, displayName: "Renamed By Automation" },
        },
      ],
      edges: [{ id: "e1", source: "t", target: "u" }],
    };
    const created = await admin.automations.create({
      name: "Renamer",
      triggerEventType: "data-models.record-created",
      graph,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });
    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    const user = await getDb().user.findUnique({ where: { id: U_MEMBER } });
    expect(user?.displayName).toBe("Renamed By Automation");
  });
});

describe("automation — authorization", () => {
  it("denies create to an org member without the automation permission", async () => {
    await expect(
      callerFor(U_MEMBER, ORG).automations.create({
        name: "nope",
        triggerEventType: "data-models.record-created",
      }),
    ).rejects.toThrow();
  });
});

// Regression guards for the security audit: a privileged node acting on a
// caller-supplied id must scope that id to the run's own org, never operate on
// another org's record / user just because the owner holds the permission in
// their own org.
describe("automation — cross-org node guards", () => {
  const ORG_B = "auto-it-org-b";
  const U_OUTSIDER = "auto-it-outsider"; // a user with NO membership in ORG

  beforeAll(async () => {
    const db = getDb();
    await db.organization.upsert({
      where: { id: ORG_B },
      create: { id: ORG_B, slug: ORG_B, displayName: ORG_B },
      update: {},
    });
    await db.user.upsert({
      where: { id: U_OUTSIDER },
      create: { id: U_OUTSIDER, email: `${U_OUTSIDER}@test.local` },
      update: {},
    });
  });
  afterAll(async () => {
    const db = getDb();
    await db.organization.deleteMany({ where: { id: ORG_B } });
    await db.user.deleteMany({ where: { id: U_OUTSIDER } });
  });

  it("refuses to delete a record belonging to another org", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    // A record that lives in ORG_B, not the automation's org (ORG).
    const foreignModel = await createDataModel({
      organizationId: ORG_B,
      key: "foreign-model",
      name: "Foreign",
      createdBy: U_OUTSIDER,
    });
    const foreign = await createDataRecord({
      dataModelId: foreignModel.id,
      data: { title: "do not touch" },
      createdBy: U_OUTSIDER,
    });

    const created = await admin.automations.create({
      name: "Cross-org delete",
      triggerEventType: "data-models.record-created",
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.event-trigger",
            position: { x: 0, y: 0 },
            config: { eventType: "data-models.record-created" },
          },
          {
            id: "d",
            type: "automation.data-delete-record",
            position: { x: 200, y: 0 },
            config: { recordId: foreign.id, hard: true },
          },
        ],
        edges: [{ id: "e", source: "t", target: "d" }],
      },
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });
    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    // The run must not succeed (a missing guard would have deleted the record
    // and succeeded); the delete step itself is recorded FAILED.
    expect(run.status).not.toBe("SUCCEEDED");
    expect(run.steps.find((s) => s.nodeId === "d")?.status).toBe("FAILED");
    // The foreign record must still exist — the node refused to touch it.
    const still = await getDb().dataRecord.findUnique({ where: { id: foreign.id } });
    expect(still).not.toBeNull();
  });

  it("refuses to disable a user who is not a member of the run's org", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "Cross-org disable",
      triggerEventType: "data-models.record-created",
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.event-trigger",
            position: { x: 0, y: 0 },
            config: { eventType: "data-models.record-created" },
          },
          {
            id: "u",
            type: "automation.user-set-active",
            position: { x: 200, y: 0 },
            config: { userId: U_OUTSIDER, action: "disable" },
          },
        ],
        edges: [{ id: "e", source: "t", target: "u" }],
      },
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });
    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).not.toBe("SUCCEEDED");
    expect(run.steps.find((s) => s.nodeId === "u")?.status).toBe("FAILED");
    // The outsider must not have been disabled.
    const user = await getDb().user.findUnique({ where: { id: U_OUTSIDER } });
    expect(user?.disabledAt ?? null).toBeNull();
  });
});

describe("automation — branching", () => {
  it("runs the taken branch and skips the other (Condition node)", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const graph = {
      nodes: [
        {
          id: "t",
          type: "automation.event-trigger",
          position: { x: 0, y: 0 },
          config: { eventType: "data-models.record-created" },
        },
        {
          id: "cond",
          type: "automation.condition",
          position: { x: 200, y: 0 },
          config: {
            left: "{{ trigger.type }}",
            operator: "eq",
            right: "data-models.record-created",
          },
        },
        { id: "yes", type: "test.echo", position: { x: 400, y: -60 }, config: { message: "yes" } },
        { id: "no", type: "test.echo", position: { x: 400, y: 60 }, config: { message: "no" } },
      ],
      edges: [
        { id: "e1", source: "t", target: "cond" },
        { id: "e2", source: "cond", target: "yes", sourceHandle: "true" },
        { id: "e3", source: "cond", target: "no", sourceHandle: "false" },
      ],
    };
    const created = await admin.automations.create({
      name: "Branchy",
      triggerEventType: "data-models.record-created",
      graph,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });
    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps.find((s) => s.nodeId === "yes")?.status).toBe("SUCCEEDED");
    expect(run.steps.find((s) => s.nodeId === "no")?.status).toBe("SKIPPED");
  });
});

describe("automation — control nodes", () => {
  async function runGraph(name: string, graph: unknown): Promise<string> {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name,
      triggerEventType: "data-models.record-created",
      graph: graph as never,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });
    const { runId } = await admin.automations.runNow({ id: created.id });
    return runId;
  }

  it("Constant outputs a typed value", async () => {
    const runId = await runGraph("Const", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        {
          id: "c",
          type: "automation.constant",
          position: { x: 200, y: 0 },
          config: { valueType: "number", value: "7" },
        },
      ],
      edges: [{ id: "e", source: "t", target: "c" }],
    });
    await drain();
    const run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    expect((run.steps.find((s) => s.nodeId === "c")?.output as { value?: number })?.value).toBe(7);
  });

  it("Transform evaluates a formula", async () => {
    const runId = await runGraph("Xform", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        {
          id: "x",
          type: "automation.transform",
          position: { x: 200, y: 0 },
          config: { expression: "6 * 7" },
        },
      ],
      edges: [{ id: "e", source: "t", target: "x" }],
    });
    await drain();
    const run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    expect((run.steps.find((s) => s.nodeId === "x")?.output as { value?: number })?.value).toBe(42);
  });

  it("Delay suspends the run and resumes downstream after the delay", async () => {
    const runId = await runGraph("Delayed", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        {
          id: "d",
          type: "automation.delay",
          position: { x: 200, y: 0 },
          config: { seconds: 1 },
        },
        { id: "e2", type: "test.echo", position: { x: 400, y: 0 }, config: { message: "after" } },
      ],
      edges: [
        { id: "ea", source: "t", target: "d" },
        { id: "eb", source: "d", target: "e2" },
      ],
    });
    await drain();
    // Suspended: the delay step is done but the downstream echo hasn't run, and
    // the run is back to PENDING (re-scheduled for the future).
    let run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("PENDING");
    expect(run.steps.find((s) => s.nodeType === "automation.delay")?.status).toBe("SUCCEEDED");
    expect(run.steps.find((s) => s.nodeId === "e2")).toBeUndefined();

    // After the delay elapses, a drain resumes it and runs the downstream node.
    await new Promise((r) => setTimeout(r, 1200));
    await drain();
    run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps.find((s) => s.nodeId === "e2")?.status).toBe("SUCCEEDED");
  });

  it("Set Variable exposes a run-global {{ vars.<name> }} to a downstream node", async () => {
    const runId = await runGraph("Vars", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        {
          id: "sv",
          type: "automation.set-variable",
          position: { x: 200, y: 0 },
          config: { name: "greeting", value: "hello-var" },
        },
        {
          id: "e",
          type: "test.echo",
          position: { x: 400, y: 0 },
          config: { message: "{{ vars.greeting }}" },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "sv" },
        { id: "e2", source: "sv", target: "e" },
      ],
    });
    await drain();
    const run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    // The downstream echo resolved the variable the Set Variable node set.
    expect((run.steps.find((s) => s.nodeId === "e")?.output as { echoed?: string })?.echoed).toBe(
      "hello-var",
    );
  });

  it("resolves a node output addressed by its `{{ steps.<slug> }}` alias", async () => {
    const runId = await runGraph("Slugged", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        {
          id: "c",
          type: "automation.constant",
          position: { x: 150, y: 0 },
          config: { valueType: "text", value: "from-slug" },
          slug: "my_const",
        },
        {
          id: "e",
          type: "test.echo",
          position: { x: 350, y: 0 },
          // References the Constant by its slug, not its node id ; the engine must
          // pull `c` in (no control edge) and resolve `steps.my_const.value`.
          config: { message: "{{ steps.my_const.value }}" },
        },
      ],
      edges: [{ id: "e1", source: "t", target: "e" }],
    });
    await drain();
    const run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    expect((run.steps.find((s) => s.nodeId === "e")?.output as { echoed?: string })?.echoed).toBe(
      "from-slug",
    );
  });

  it("composes the whole data-flow redesign: steps.<slug> feeding a Set Variable read downstream via vars", async () => {
    const runId = await runGraph("FullFlow", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        // Emits { title: "linked title" }, addressed by its slug below.
        { id: "p", type: "test.payload", position: { x: 150, y: 0 }, config: {}, slug: "lookup" },
        // Stores the slug-addressed value into a workflow variable.
        {
          id: "sv",
          type: "automation.set-variable",
          position: { x: 300, y: 0 },
          config: { name: "msg", value: "{{ steps.lookup.title }}" },
        },
        // Reads it back through the vars scope.
        {
          id: "e",
          type: "test.echo",
          position: { x: 450, y: 0 },
          config: { message: "{{ vars.msg }}" },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "p" },
        { id: "e2", source: "p", target: "sv" },
        { id: "e3", source: "sv", target: "e" },
      ],
    });
    await drain();
    const run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    // steps.lookup.title → set var msg → vars.msg → echo, all the way through.
    expect((run.steps.find((s) => s.nodeId === "e")?.output as { echoed?: string })?.echoed).toBe(
      "linked title",
    );
  });

  it("a workflow variable set before a Delay is still in scope after the run resumes", async () => {
    // Proves `collectVars` replay on resume: the var is set, the run suspends at
    // the Delay, and on resume the downstream node must still see `{{ vars.v }}`.
    const runId = await runGraph("VarsResume", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        {
          id: "sv",
          type: "automation.set-variable",
          position: { x: 150, y: 0 },
          config: { name: "v", value: "kept" },
        },
        { id: "d", type: "automation.delay", position: { x: 300, y: 0 }, config: { seconds: 1 } },
        {
          id: "e",
          type: "test.echo",
          position: { x: 450, y: 0 },
          config: { message: "{{ vars.v }}" },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "sv" },
        { id: "e2", source: "sv", target: "d" },
        { id: "e3", source: "d", target: "e" },
      ],
    });
    await drain();
    // Suspended at the Delay: the echo hasn't run yet.
    let run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("PENDING");
    expect(run.steps.find((s) => s.nodeId === "e")).toBeUndefined();

    await new Promise((r) => setTimeout(r, 1200));
    await drain();
    run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    // The variable survived the suspend/resume and resolved for the echo.
    expect((run.steps.find((s) => s.nodeId === "e")?.output as { echoed?: string })?.echoed).toBe(
      "kept",
    );
  });

  it("runs a source Constant (no control edge) wired into multiple fields", async () => {
    const runId = await runGraph("FanOut", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        {
          id: "c",
          type: "automation.constant",
          position: { x: 150, y: 0 },
          config: { valueType: "text", value: "hello" },
        },
        { id: "tw", type: "test.two", position: { x: 300, y: 0 }, config: {} },
      ],
      // The Constant has NO control-flow edge — only its value wired into two
      // fields. It must still run (pulled in as a data source), and each field
      // gets the unwrapped scalar.
      edges: [
        { id: "e1", source: "t", target: "tw" },
        { id: "e2", source: "c", target: "tw", targetHandle: "field:a" },
        { id: "e3", source: "c", target: "tw", targetHandle: "field:b" },
      ],
    });
    await drain();
    const run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    const out = run.steps.find((s) => s.nodeId === "tw")?.output as
      | { a?: unknown; b?: unknown }
      | undefined;
    // Both fields got the Constant's value, unwrapped from `{ value: "hello" }`.
    expect(out?.a).toBe("hello");
    expect(out?.b).toBe("hello");
  });

  it("resumes only the taken branch when a Delay follows a Condition", async () => {
    // cond → (true) delay → after ; cond → (false) falseB. The delay is earlier
    // in topo order than falseB, so falseB is unreached at suspend. On resume the
    // engine must re-activate ONLY cond's taken (true) handle, leaving falseB
    // skipped — the fix for the delay-after-branch gap.
    const runId = await runGraph("BranchDelay", {
      nodes: [
        { id: "t", type: "automation.event-trigger", position: { x: 0, y: 0 }, config: {} },
        {
          id: "cond",
          type: "automation.condition",
          position: { x: 150, y: 0 },
          config: {
            left: "{{ trigger.type }}",
            operator: "eq",
            right: "data-models.record-created",
          },
        },
        {
          id: "dly",
          type: "automation.delay",
          position: { x: 300, y: -60 },
          config: { seconds: 1 },
        },
        {
          id: "after",
          type: "test.echo",
          position: { x: 450, y: -60 },
          config: { message: "after" },
        },
        {
          id: "falseB",
          type: "test.echo",
          position: { x: 300, y: 60 },
          config: { message: "false" },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "cond" },
        { id: "e2", source: "cond", target: "dly", sourceHandle: "true" },
        { id: "e3", source: "cond", target: "falseB", sourceHandle: "false" },
        { id: "e4", source: "dly", target: "after" },
      ],
    });
    await drain();
    await new Promise((r) => setTimeout(r, 1200));
    await drain();

    const run = await callerFor(U_ADMIN, ORG).runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps.find((s) => s.nodeId === "after")?.status).toBe("SUCCEEDED");
    // The false branch stays pruned across the resume (not re-activated).
    expect(run.steps.find((s) => s.nodeId === "falseB")?.status).toBe("SKIPPED");
  });
});

describe("automation — data node", () => {
  it("creates a Data Record via the data-create node (owner passes the re-check)", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    await createDataModel({
      organizationId: ORG,
      key: "auto-task",
      name: "Auto Task",
      createdBy: U_ADMIN,
    });
    const graph = {
      nodes: [
        {
          id: "t",
          type: "automation.event-trigger",
          position: { x: 0, y: 0 },
          config: { eventType: "data-models.record-created" },
        },
        {
          id: "c",
          type: "automation.data-create-record",
          position: { x: 200, y: 0 },
          config: { modelKey: "auto-task", data: '{"title":"from automation"}' },
        },
      ],
      edges: [{ id: "e", source: "t", target: "c" }],
    };
    const created = await admin.automations.create({
      name: "Create task",
      triggerEventType: "data-models.record-created",
      graph,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });
    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    const step = run.steps.find((s) => s.nodeType === "automation.data-create-record");
    const recordId = (step?.output as { recordId?: string } | undefined)?.recordId;
    expect(recordId).toBeTruthy();
    const record = await getDb().dataRecord.findUnique({ where: { id: recordId ?? "" } });
    expect(record?.title).toBe("from automation");
  });

  it("feeds a linkable field from an upstream node's output (field:data edge)", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    await createDataModel({
      organizationId: ORG,
      key: "auto-linked",
      name: "Auto Linked",
      createdBy: U_ADMIN,
    });
    const graph = {
      nodes: [
        {
          id: "t",
          type: "automation.event-trigger",
          position: { x: 0, y: 0 },
          config: { eventType: "data-models.record-created" },
        },
        { id: "p", type: "test.payload", position: { x: 200, y: 0 }, config: {} },
        {
          id: "c",
          type: "automation.data-create-record",
          position: { x: 400, y: 0 },
          // The typed `data` here is a decoy — the field:data link overrides it.
          config: { modelKey: "auto-linked", data: '{"title":"typed"}' },
        },
      ],
      edges: [
        { id: "e1", source: "t", target: "p" },
        { id: "e2", source: "p", target: "c" },
        { id: "e3", source: "p", target: "c", targetHandle: "field:data" },
      ],
    };
    const created = await admin.automations.create({
      name: "Linked",
      triggerEventType: "data-models.record-created",
      graph,
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });
    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();

    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
    const step = run.steps.find((s) => s.nodeType === "automation.data-create-record");
    const recordId = (step?.output as { recordId?: string } | undefined)?.recordId;
    const record = await getDb().dataRecord.findUnique({ where: { id: recordId ?? "" } });
    // The linked payload's `title` won, not the typed decoy.
    expect(record?.title).toBe("linked title");
  });

  it("fails a privileged node when the automation owner lacks the permission", async () => {
    // Owner = U_MEMBER, who has no data-models permissions. Build + enqueue the
    // run directly (the run-now tRPC path would itself deny a permission-less
    // caller ; here we exercise the engine's owner re-check).
    const auto = await createAutomation({
      organizationId: ORG,
      name: "Denied",
      triggerEventType: "x.y",
      enabled: true,
      createdBy: U_MEMBER,
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.event-trigger",
            position: { x: 0, y: 0 },
            config: { eventType: "x.y" },
          },
          {
            id: "c",
            type: "automation.data-create-record",
            position: { x: 200, y: 0 },
            config: { modelKey: "auto-task", data: "{}" },
          },
        ],
        edges: [{ id: "e", source: "t", target: "c" }],
      },
    });
    const run = await createPendingRun({
      automationId: auto.id,
      organizationId: ORG,
      triggerEventType: "x.y",
      triggerPayload: { type: "x.y" },
      manual: true,
      createdBy: U_MEMBER,
    });
    await drain();

    const detail = await getDb().automationRun.findUnique({
      where: { id: run.id },
      include: { steps: true },
    });
    const createStep = detail?.steps.find((s) => s.nodeType === "automation.data-create-record");
    expect(createStep?.status).toBe("FAILED");
  });

  it("catches a node failure via its error output and continues the run", async () => {
    // Same denied data-create node, but with its error output enabled and wired
    // to a downstream Constant. The node fails, but the run continues down the
    // error branch instead of aborting.
    const auto = await createAutomation({
      organizationId: ORG,
      name: "Caught",
      triggerEventType: "x.y",
      enabled: true,
      createdBy: U_MEMBER,
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.event-trigger",
            position: { x: 0, y: 0 },
            config: { eventType: "x.y" },
          },
          {
            id: "c",
            type: "automation.data-create-record",
            position: { x: 200, y: 0 },
            config: { modelKey: "auto-task", data: "{}" },
            errorOutput: true,
          },
          {
            id: "h",
            type: "automation.constant",
            position: { x: 400, y: 0 },
            config: { valueType: "text", value: "handled" },
          },
        ],
        edges: [
          { id: "e1", source: "t", target: "c" },
          { id: "e2", source: "c", target: "h", sourceHandle: "error" },
        ],
      },
    });
    const run = await createPendingRun({
      automationId: auto.id,
      organizationId: ORG,
      triggerEventType: "x.y",
      triggerPayload: { type: "x.y" },
      manual: true,
      createdBy: U_MEMBER,
    });
    await drain();

    const detail = await getDb().automationRun.findUnique({
      where: { id: run.id },
      include: { steps: true },
    });
    // The run completed (the failure was handled), not aborted.
    expect(detail?.status).toBe("SUCCEEDED");
    const createStep = detail?.steps.find((s) => s.nodeType === "automation.data-create-record");
    expect(createStep?.status).toBe("FAILED"); // still recorded as failed
    // The error branch ran.
    const handled = detail?.steps.find((s) => s.nodeType === "automation.constant");
    expect(handled?.status).toBe("SUCCEEDED");
  });
});

describe("automation — trigger types", () => {
  it("derives the manual sentinel and runs a manual trigger via Run now", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "Manual flow",
      graph: {
        nodes: [
          { id: "t", type: "automation.manual-trigger", position: { x: 0, y: 0 }, config: {} },
          { id: "e", type: "test.echo", position: { x: 200, y: 0 }, config: { message: "hi" } },
        ],
        edges: [{ id: "e1", source: "t", target: "e" }],
      },
    });
    // The server derived the bus-ignored sentinel from the manual trigger node.
    expect(created.triggerEventType).toBe("automation.manual");
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    const { runId } = await admin.automations.runNow({ id: created.id });
    await drain();
    const run = await admin.runs.getById({ id: runId });
    expect(run.status).toBe("SUCCEEDED");
  });

  it("fires an HTTP trigger only with the right secret, exposing the body", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "HTTP flow",
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.http-trigger",
            position: { x: 0, y: 0 },
            config: { secret: "test-secret-123" },
          },
          {
            id: "e",
            type: "test.echo",
            position: { x: 200, y: 0 },
            config: { message: "hi {{ trigger.body.name }}" },
          },
        ],
        edges: [{ id: "e1", source: "t", target: "e" }],
      },
    });
    expect(created.triggerEventType).toBe("automation.http");
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    // Wrong secret is rejected, no run enqueued.
    const bad = await handleHttpTrigger({ automationId: created.id, secret: "nope", body: {} });
    expect(bad.status).toBe(401);

    // Right secret enqueues a run with the body as the trigger payload.
    const ok = await handleHttpTrigger({
      automationId: created.id,
      secret: "test-secret-123",
      body: { name: "world" },
    });
    expect(ok.status).toBe(202);
    if (ok.status !== 202) return;
    await drain();
    const run = await admin.runs.getById({ id: ok.runId });
    expect(run.status).toBe("SUCCEEDED");
    const echoStep = run.steps.find((s) => s.nodeId === "e");
    expect(echoStep?.output).toEqual({ echoed: "hi world" });
  });

  it("rejects an HTTP trigger when the automation is disabled", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const created = await admin.automations.create({
      name: "HTTP disabled",
      graph: {
        nodes: [
          {
            id: "t",
            type: "automation.http-trigger",
            position: { x: 0, y: 0 },
            config: { secret: "sekret" },
          },
          { id: "e", type: "test.echo", position: { x: 200, y: 0 }, config: { message: "x" } },
        ],
        edges: [{ id: "e1", source: "t", target: "e" }],
      },
    });
    // Left disabled on purpose.
    const res = await handleHttpTrigger({ automationId: created.id, secret: "sekret", body: {} });
    expect(res.status).toBe(409);
  });

  it("schedule trigger : enabling sets the next run ; the scheduler enqueues a due fire and advances it", async () => {
    const admin = callerFor(U_ADMIN, ORG);
    const db = getDb();
    const created = await admin.automations.create({
      name: "Scheduled flow",
      graph: {
        nodes: [
          {
            id: "s",
            type: "automation.schedule-trigger",
            position: { x: 0, y: 0 },
            config: { schedule: { kind: "interval", everyMinutes: 20 } },
          },
          { id: "e", type: "test.echo", position: { x: 200, y: 0 }, config: { message: "tick" } },
        ],
        edges: [{ id: "e1", source: "s", target: "e" }],
      },
    });
    await admin.automations.setEnabled({ id: created.id, enabled: true });

    // Enabling computed a future next-run (next 20-minute grid slot).
    const enabled = await db.automation.findUnique({ where: { id: created.id } });
    expect(enabled?.scheduleNextRunAt).not.toBeNull();
    expect((enabled?.scheduleNextRunAt?.getTime() ?? 0) > Date.now()).toBe(true);

    // Force it due, then run the scheduler.
    await db.automation.update({
      where: { id: created.id },
      data: { scheduleNextRunAt: new Date(Date.now() - 60_000) },
    });
    const { enqueued } = await runDueSchedules(new Date());
    expect(enqueued).toBeGreaterThanOrEqual(1);

    // The next run advanced back into the future (fires exactly once).
    const advanced = await db.automation.findUnique({ where: { id: created.id } });
    expect((advanced?.scheduleNextRunAt?.getTime() ?? 0) > Date.now()).toBe(true);

    // The enqueued run drains and executes end-to-end.
    await drain();
    const runs = await admin.runs.list({ automationId: created.id, limit: 5 });
    expect(runs.items.length).toBeGreaterThanOrEqual(1);
    const first = runs.items[0];
    const detail = await admin.runs.getById({ id: first?.id ?? "" });
    expect(detail.status).toBe("SUCCEEDED");
    expect(detail.steps.find((s) => s.nodeId === "e")?.output).toEqual({ echoed: "tick" });
  });
});
