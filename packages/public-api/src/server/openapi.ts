import { z, type ZodTypeAny } from "zod";
import type { RouteDescriptor } from "./routes";

// A small, curated Zod → JSON-Schema step. It covers exactly the Zod
// constructs the v1 route schemas use ; anything unrecognised degrades to an
// open `{}` schema rather than throwing, so an OpenAPI doc is always
// produced. We hand-roll this (vs. pulling in `zod-to-json-schema`) to keep
// the dependency surface of a public contract minimal and under our control.
export function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodLiteral) return { const: schema.value };
  if (schema instanceof z.ZodEnum) return { type: "string", enum: [...schema.options] };
  if (schema instanceof z.ZodArray)
    return { type: "array", items: zodToJsonSchema(schema.element) };
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema.removeDefault());
  if (schema instanceof z.ZodNullable) {
    return { ...zodToJsonSchema(schema.unwrap()), nullable: true };
  }
  if (schema instanceof z.ZodRecord) {
    return { type: "object", additionalProperties: zodToJsonSchema(schema.valueSchema) };
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema.options as ZodTypeAny[];
    return { anyOf: options.map(zodToJsonSchema) };
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }
  return {};
}

// Query params come from a ZodObject ; each top-level field becomes a `query`
// parameter, required unless optional / defaulted.
function queryParameters(schema: ZodTypeAny | undefined): Array<Record<string, unknown>> {
  if (!(schema instanceof z.ZodObject)) return [];
  const shape = schema.shape as Record<string, ZodTypeAny>;
  return Object.entries(shape).map(([name, value]) => ({
    name,
    in: "query",
    required: !(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault),
    schema: zodToJsonSchema(value),
  }));
}

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
  /** Base URL prefix (e.g. "/api/v1") advertised in `servers`. */
  serverUrl?: string;
}

/**
 * Build an OpenAPI 3.0 document from the route descriptors. Paths, path/query
 * params, request bodies, the bearer security scheme, and each route's required
 * RBAC permission are derived from the same descriptors that serve traffic, so
 * the spec can never drift from the implementation.
 */
export function buildOpenApiSpec<TCaller>(
  routes: RouteDescriptor<TCaller>[],
  info: OpenApiInfo,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const openApiPath = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    const pathParamNames = [...route.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1] ?? "");

    const operation: Record<string, unknown> = {
      summary: route.summary,
      ...(route.description ? { description: route.description } : {}),
      tags: route.tags ?? ["default"],
      security: [{ ApiKeyAuth: [] }],
      ...(route.permission ? { "x-required-permission": route.permission } : {}),
      // Exposed routes advertise their MCP tool here ; the MCP server generates
      // its tool set from this, so agent visibility tracks the API automatically.
      ...("expose" in route.mcp ? { "x-mcp-tool": route.mcp.expose } : {}),
      parameters: [
        ...pathParamNames.map((name) => ({
          name,
          in: "path",
          required: true,
          schema: { type: "string" },
        })),
        ...queryParameters(route.request?.query),
      ],
      responses: {
        "200": {
          description: "Success",
          ...(route.response
            ? { content: { "application/json": { schema: zodToJsonSchema(route.response) } } }
            : {}),
        },
        "401": { description: "Missing or invalid API key" },
        "403": { description: "The key's principal lacks the required permission" },
        "429": { description: "Rate limit exceeded" },
      },
    };

    if (route.request?.body) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: zodToJsonSchema(route.request.body) } },
      };
    }

    (paths[openApiPath] ??= {})[route.method] = operation;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: info.title,
      version: info.version,
      ...(info.description ? { description: info.description } : {}),
    },
    ...(info.serverUrl ? { servers: [{ url: info.serverUrl }] } : {}),
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "http",
          scheme: "bearer",
          description: "A Monark API key (`mrk_…`) passed as a Bearer token.",
        },
      },
    },
    paths,
  };
}
