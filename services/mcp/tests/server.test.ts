import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MonarkApiError, type MonarkClient } from "../src/client";
import { toolsFromOpenApi } from "../src/openapi";
import { buildServer } from "../src/server";

// Protocol-level smoke test : a real MCP Client talks to our server over the
// SDK's in-memory transport, exercising the low-level tools/list + tools/call
// wiring, the OpenAPI-derived input schemas, and the result / error formatting.

const SPEC = {
  paths: {
    "/me": { get: { "x-mcp-tool": { name: "monark_whoami", description: "who am i" } } },
    "/records/{id}": {
      get: {
        "x-mcp-tool": { name: "monark_get_record", description: "get a record by id" },
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      },
    },
  },
};

async function connect(request: MonarkClient["request"]): Promise<Client> {
  const client = { request } as unknown as MonarkClient;
  const server = buildServer(client, toolsFromOpenApi(SPEC));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
  return mcp;
}

function textOf(res: { content: unknown }): string {
  return (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("");
}

describe("MCP server (protocol)", () => {
  it("advertises the generated tools with their input schemas", async () => {
    const mcp = await connect(vi.fn());
    const { tools } = await mcp.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["monark_get_record", "monark_whoami"]);
    const getRecord = tools.find((t) => t.name === "monark_get_record");
    expect((getRecord?.inputSchema as { required?: string[] }).required).toContain("id");
  });

  it("calls a tool and returns the API result as text", async () => {
    const request = vi.fn().mockResolvedValue({ userId: "u1" });
    const mcp = await connect(request);
    const res = await mcp.callTool({ name: "monark_whoami", arguments: {} });
    expect(request).toHaveBeenCalledWith("GET", "/me", { query: {}, body: undefined });
    expect(textOf(res)).toContain("u1");
    expect(res.isError).toBeFalsy();
  });

  it("surfaces an API error as an isError result", async () => {
    const request = vi.fn().mockRejectedValue(new MonarkApiError(404, "not_found", "nope"));
    const mcp = await connect(request);
    const res = await mcp.callTool({ name: "monark_get_record", arguments: { id: "x" } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("404");
  });

  it("returns an isError result for an unknown tool", async () => {
    const mcp = await connect(vi.fn());
    const res = await mcp.callTool({ name: "monark_nonexistent", arguments: {} });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("Unknown tool");
  });
});
