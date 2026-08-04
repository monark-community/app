/**
 * Live end-to-end test for the MCP server.
 *
 * Boots the REAL Express API on a real port against a Postgres testcontainer,
 * seeds an org + admin + an `mrk_` key + a Data Model with a record, then drives
 * the `@monark/mcp` server through a real MCP `Client` (over the SDK's in-memory
 * transport). Each tool call travels : MCP protocol → MonarkClient → HTTP →
 * `/api/v1` → tRPC caller → Postgres. This proves the whole chain works
 * together, not just the pieces in isolation.
 */

import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { getDb } from "@monark/db";
import { t } from "@monark/common/trpc";
import { assignRole } from "@monark/rbac/server";
import { setOverride, syncFlagsToDatabase } from "@monark/feature-flags/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MonarkClient } from "@monark/mcp/client";
import { createMcpServer } from "@monark/mcp/server";

process.env.CRON_SECRET = process.env.CRON_SECRET ?? "test-cron-secret";
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_test";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? "sb_secret_test";
process.env.NODE_ENV = "test";

const { app } = await import("../../src/server");
const { appRouter } = await import("../../src/trpc/router");
const createCaller = t.createCallerFactory(appRouter);

const ORG = "mcp-e2e-org";
const OWNER = "mcp-e2e-owner";
const ADMIN_BUILTIN_ID = "role_admin_builtin";
const MODEL_KEY = "widgets";

let httpServer: Server;
let baseUrl = "";
let mcp: Client;

function text(res: { content: unknown }): string {
  return (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("");
}

async function cleanup() {
  const db = getDb();
  await db.apiKey.deleteMany({ where: { organizationId: ORG } });
  await db.roleAssignment.deleteMany({ where: { userId: OWNER } });
  await db.organizationMembership.deleteMany({ where: { organizationId: ORG } });
  await db.dataModel.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.user.deleteMany({ where: { id: OWNER } });
}

beforeAll(async () => {
  const db = getDb();
  await cleanup();
  await db.organization.create({ data: { id: ORG, slug: ORG, displayName: ORG } });
  await db.user.create({ data: { id: OWNER, email: `${OWNER}@test.local` } });
  await db.organizationMembership.create({ data: { userId: OWNER, organizationId: ORG } });
  await db.role.upsert({
    where: { id: ADMIN_BUILTIN_ID },
    create: {
      id: ADMIN_BUILTIN_ID,
      key: "ADMIN",
      name: "Administrator",
      builtIn: true,
      organizationId: null,
    },
    update: {},
  });
  await assignRole({
    userId: OWNER,
    roleId: ADMIN_BUILTIN_ID,
    organizationId: ORG,
    grantedById: null,
  });
  await syncFlagsToDatabase();
  await setOverride("public-api.enabled", {}, true, OWNER);

  const caller = createCaller({ userId: OWNER, activeOrganizationId: ORG, requestId: "mcp-seed" });
  const model = await caller.dataModels.models.create({ key: MODEL_KEY, name: "Widgets" });
  await caller.dataModels.fields.create({
    dataModelId: model.id,
    key: "name",
    label: "Name",
    type: "TEXT",
  });
  await caller.dataModels.records.create({
    dataModelId: model.id,
    data: { title: "Alpha", name: "Alpha widget" },
  });
  const key = await caller.apiKeys.create({ name: "mcp-e2e-key" });

  // Boot the real HTTP server on an ephemeral port.
  httpServer = app.listen(0);
  await once(httpServer, "listening");
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;

  // Wire the MCP server (a real MonarkClient → the live API) to a real MCP Client.
  // createMcpServer fetches the live OpenAPI to build its tools, so this also
  // proves the auto-generation works against the real spec.
  const monark = new MonarkClient({ apiUrl: baseUrl, apiKey: key.plaintext });
  const server = await createMcpServer(monark);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  mcp = new Client({ name: "mcp-e2e", version: "1.0.0" });
  await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
});

afterAll(async () => {
  await mcp?.close().catch(() => {});
  if (httpServer) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await cleanup();
});

describe("MCP end-to-end (live API + Postgres)", () => {
  it("monark_whoami returns the key's real principal + org", async () => {
    const res = await mcp.callTool({ name: "monark_whoami", arguments: {} });
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(text(res));
    expect(body).toMatchObject({ userId: OWNER, organizationId: ORG });
  });

  it("monark_list_records reads the seeded record through the whole stack", async () => {
    const res = await mcp.callTool({ name: "monark_list_records", arguments: { key: MODEL_KEY } });
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(text(res)) as { items: Array<{ title: string }> };
    expect(body.items.some((r) => r.title === "Alpha")).toBe(true);
  });

  it("monark_create_record writes a record that really lands in Postgres", async () => {
    const res = await mcp.callTool({
      name: "monark_create_record",
      arguments: { key: MODEL_KEY, data: { title: "Made via MCP", name: "mcp widget" } },
    });
    expect(res.isError).toBeFalsy();
    const created = JSON.parse(text(res)) as { id: string };
    expect(created.id).toBeTruthy();

    const row = await getDb().dataRecord.findUnique({ where: { id: created.id } });
    expect(row).not.toBeNull();
  });

  it("surfaces a real API 404 as an isError result", async () => {
    const res = await mcp.callTool({
      name: "monark_get_record",
      arguments: { id: "does-not-exist" },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("404");
  });
});
