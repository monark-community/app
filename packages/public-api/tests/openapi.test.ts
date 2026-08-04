import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildOpenApiSpec, zodToJsonSchema } from "../src/server/openapi";
import type { RouteDescriptor } from "../src/server/routes";

describe("zodToJsonSchema", () => {
  it("converts primitives, arrays, records, and optionals", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number().optional(),
      tags: z.array(z.string()),
      data: z.record(z.string(), z.unknown()),
      slug: z.string().nullable().optional(),
    });
    const json = zodToJsonSchema(schema);
    expect(json).toMatchObject({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        data: { type: "object" },
      },
      additionalProperties: false,
    });
    // Only non-optional fields are required.
    expect(json.required).toEqual(["name", "tags", "data"]);
  });

  it("falls back to an open schema for unknown types", () => {
    expect(zodToJsonSchema(z.unknown())).toEqual({});
  });
});

describe("buildOpenApiSpec", () => {
  const routes: RouteDescriptor[] = [
    {
      method: "get",
      path: "/models/:key/records",
      summary: "List records",
      permission: "data-models.record-read",
      mcp: { expose: { name: "monark_list_records", description: "List records in a model." } },
      request: {
        query: z.object({ limit: z.coerce.number().optional(), search: z.string().optional() }),
      },
      handler: async () => ({}),
    },
    {
      method: "post",
      path: "/models/:key/records",
      summary: "Create a record",
      permission: "data-models.record-write",
      mcp: { expose: { name: "monark_create_record", description: "Create a record in a model." } },
      request: { body: z.object({ data: z.record(z.string(), z.unknown()) }) },
      handler: async () => ({}),
    },
    {
      method: "get",
      path: "/internal/thing",
      summary: "Internal",
      mcp: { skip: "internal-only" },
      handler: async () => ({}),
    },
  ];

  it("emits an OpenAPI 3 doc with converted paths, params, permission, and MCP tools", () => {
    const spec = buildOpenApiSpec(routes, {
      title: "Test API",
      version: "1.0.0",
      serverUrl: "/api/v1",
    });
    expect(spec.openapi).toBe("3.0.3");

    const paths = spec.paths as Record<
      string,
      Record<
        string,
        {
          parameters?: unknown[];
          "x-required-permission"?: string;
          "x-mcp-tool"?: { name: string };
          requestBody?: unknown;
        }
      >
    >;
    // Express `:key` becomes OpenAPI `{key}`.
    const path = paths["/models/{key}/records"];
    expect(path).toBeDefined();

    const get = path?.get;
    expect(get?.["x-required-permission"]).toBe("data-models.record-read");
    // Exposed route advertises its MCP tool ; skipped route does not.
    expect(get?.["x-mcp-tool"]?.name).toBe("monark_list_records");
    expect(paths["/internal/thing"]?.get?.["x-mcp-tool"]).toBeUndefined();

    // Path param + query params both present.
    const paramNames = (get?.parameters as Array<{ name: string; in: string }>).map(
      (p) => `${p.in}:${p.name}`,
    );
    expect(paramNames).toContain("path:key");
    expect(paramNames).toContain("query:limit");
    expect(paramNames).toContain("query:search");

    // POST carries a JSON request body.
    expect(path?.post?.requestBody).toBeDefined();

    // Bearer security scheme is declared.
    const components = spec.components as { securitySchemes: { ApiKeyAuth: { scheme: string } } };
    expect(components.securitySchemes.ApiKeyAuth.scheme).toBe("bearer");
  });
});
