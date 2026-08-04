import type { MonarkClient, QueryValue } from "./client";

// Auto-generate the MCP tool set from the Monark deployment's OpenAPI document.
// Each operation the API tagged with `x-mcp-tool` (its curated agent-facing name
// + description) becomes a tool ; its input schema + how to turn a tool call
// back into an HTTP request are both derived from the operation's declared
// path/query params + request body. So agent visibility tracks the API with zero
// hand-maintained tool list — a new exposed route just appears.

type HttpVerb = "GET" | "POST" | "PATCH" | "DELETE";

interface ToolPlan {
  method: HttpVerb;
  /** OpenAPI path relative to /api/v1, e.g. "/models/{key}/records". */
  pathTemplate: string;
  pathParams: string[];
  queryParams: string[];
  bodyParams: string[];
}

export interface GeneratedTool {
  name: string;
  description: string;
  /** JSON Schema for the flat tool input (path + query + body args merged). */
  inputSchema: Record<string, unknown>;
  plan: ToolPlan;
}

interface OpenApiParam {
  name: string;
  in: string;
  required?: boolean;
  schema?: Record<string, unknown>;
}
interface OpenApiOperation {
  "x-mcp-tool"?: { name?: unknown; description?: unknown };
  parameters?: OpenApiParam[];
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: { properties?: Record<string, unknown>; required?: string[] };
      };
    };
  };
}

/** Pure parser : OpenAPI document → the tools it advertises via `x-mcp-tool`. */
export function toolsFromOpenApi(spec: unknown): GeneratedTool[] {
  const paths = (spec as { paths?: Record<string, Record<string, OpenApiOperation>> }).paths ?? {};
  const tools: GeneratedTool[] = [];

  for (const [pathTemplate, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const mcp = op["x-mcp-tool"];
      if (!mcp || typeof mcp.name !== "string") continue;

      const params = op.parameters ?? [];
      const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
      const bodyProps = bodySchema?.properties ?? {};
      const bodyRequired = bodySchema?.required ?? [];

      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const p of params) {
        properties[p.name] = p.schema ?? { type: "string" };
        if (p.in === "path" || p.required) required.push(p.name);
      }
      for (const [key, schema] of Object.entries(bodyProps)) {
        properties[key] = schema;
        if (bodyRequired.includes(key)) required.push(key);
      }

      tools.push({
        name: mcp.name,
        description: typeof mcp.description === "string" ? mcp.description : "",
        inputSchema: {
          type: "object",
          properties,
          ...(required.length > 0 ? { required } : {}),
          additionalProperties: false,
        },
        plan: {
          method: method.toUpperCase() as HttpVerb,
          pathTemplate,
          pathParams: params.filter((p) => p.in === "path").map((p) => p.name),
          queryParams: params.filter((p) => p.in === "query").map((p) => p.name),
          bodyParams: Object.keys(bodyProps),
        },
      });
    }
  }
  return tools;
}

/** Fetch the deployment's OpenAPI (unauthenticated but flag-gated) and derive tools. */
export async function fetchTools(client: MonarkClient): Promise<GeneratedTool[]> {
  const spec = await client.request("GET", "/openapi.json");
  return toolsFromOpenApi(spec);
}

/** Turn a tool call's flat args back into the HTTP request its plan describes. */
export async function executeTool(
  client: MonarkClient,
  tool: GeneratedTool,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { method, pathTemplate, pathParams, queryParams, bodyParams } = tool.plan;

  let path = pathTemplate;
  for (const name of pathParams) {
    path = path.replace(`{${name}}`, encodeURIComponent(String(args[name] ?? "")));
  }

  const query: Record<string, QueryValue> = {};
  for (const name of queryParams) {
    if (args[name] !== undefined) query[name] = args[name] as QueryValue;
  }

  let body: Record<string, unknown> | undefined;
  if (bodyParams.length > 0) {
    body = {};
    for (const name of bodyParams) {
      if (args[name] !== undefined) body[name] = args[name];
    }
  }

  return client.request(method, path, { query, body });
}
