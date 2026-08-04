import { describe, expect, it, vi } from "vitest";
import type { MonarkClient } from "../src/client";
import { executeTool, fetchTools, toolsFromOpenApi, type GeneratedTool } from "../src/openapi";

// A minimal OpenAPI doc shaped like what `buildOpenApiSpec` emits : operations
// carry `x-mcp-tool`, path/query params, and a JSON request body. Drives the
// parser + the flat-args → HTTP-request executor without a network.
const SPEC = {
  openapi: "3.0.3",
  paths: {
    "/me": { get: { "x-mcp-tool": { name: "monark_whoami", description: "who am i" } } },
    "/models/{key}/records": {
      get: {
        "x-mcp-tool": { name: "monark_list_records", description: "list records" },
        parameters: [
          { name: "key", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "number" } },
        ],
      },
      post: {
        "x-mcp-tool": { name: "monark_create_record", description: "create a record" },
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { data: { type: "object" }, slug: { type: "string" } },
                required: ["data"],
              },
            },
          },
        },
      },
    },
    "/records/{id}": {
      delete: {
        "x-mcp-tool": { name: "monark_delete_record", description: "delete a record" },
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "hard", in: "query", required: false, schema: { type: "boolean" } },
        ],
      },
    },
    "/internal": { get: { summary: "not exposed to agents" } },
  },
};

function toolNamed(tools: GeneratedTool[], name: string): GeneratedTool {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
}

describe("toolsFromOpenApi", () => {
  const tools = toolsFromOpenApi(SPEC);

  it("generates a tool per x-mcp-tool operation and skips the rest", () => {
    expect(tools.map((t) => t.name).sort()).toEqual([
      "monark_create_record",
      "monark_delete_record",
      "monark_list_records",
      "monark_whoami",
    ]);
  });

  it("builds the call plan from param locations", () => {
    const list = toolNamed(tools, "monark_list_records").plan;
    expect(list).toMatchObject({
      method: "GET",
      pathTemplate: "/models/{key}/records",
      pathParams: ["key"],
      queryParams: ["limit"],
      bodyParams: [],
    });
    const create = toolNamed(tools, "monark_create_record").plan;
    expect(create).toMatchObject({
      method: "POST",
      pathParams: ["key"],
      bodyParams: ["data", "slug"],
    });
  });

  it("merges path/query/body into one input schema with the right required set", () => {
    const create = toolNamed(tools, "monark_create_record").inputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(create.properties).sort()).toEqual(["data", "key", "slug"]);
    expect(create.required.sort()).toEqual(["data", "key"]); // path always required + body-required
  });
});

describe("executeTool", () => {
  function mockClient() {
    const request = vi.fn().mockResolvedValue({ ok: true });
    return { client: { request } as unknown as MonarkClient, request };
  }
  const tools = toolsFromOpenApi(SPEC);

  it("routes args to path / query and omits an empty body", async () => {
    const { client, request } = mockClient();
    await executeTool(client, toolNamed(tools, "monark_list_records"), {
      key: "widgets",
      limit: 5,
    });
    expect(request).toHaveBeenCalledWith("GET", "/models/widgets/records", {
      query: { limit: 5 },
      body: undefined,
    });
  });

  it("routes args to the body for a write", async () => {
    const { client, request } = mockClient();
    await executeTool(client, toolNamed(tools, "monark_create_record"), {
      key: "widgets",
      data: { title: "x" },
    });
    expect(request).toHaveBeenCalledWith("POST", "/models/widgets/records", {
      query: {},
      body: { data: { title: "x" } },
    });
  });

  it("url-encodes path params", async () => {
    const { client, request } = mockClient();
    await executeTool(client, toolNamed(tools, "monark_delete_record"), { id: "a/b", hard: true });
    expect(request).toHaveBeenCalledWith("DELETE", "/records/a%2Fb", {
      query: { hard: true },
      body: undefined,
    });
  });
});

describe("fetchTools", () => {
  it("fetches the OpenAPI and returns its tools", async () => {
    const request = vi.fn().mockResolvedValue(SPEC);
    const client = { request } as unknown as MonarkClient;
    const tools = await fetchTools(client);
    expect(request).toHaveBeenCalledWith("GET", "/openapi.json");
    expect(tools).toHaveLength(4);
  });
});
