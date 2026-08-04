import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MonarkApiError, type MonarkClient } from "./client";
import { executeTool, fetchTools, type GeneratedTool } from "./openapi";

// Build an MCP server whose tools are generated from the deployment's OpenAPI
// (via `x-mcp-tool`). Uses the low-level `Server` so tool input schemas can be
// the raw JSON Schema the API already publishes — no hand-written zod mirror.
// A tool result is the API's JSON ; an API error becomes an `isError` result
// carrying "status code: message" so the agent can react.
export async function createMcpServer(client: MonarkClient): Promise<Server> {
  const tools = await fetchTools(client);
  return buildServer(client, tools);
}

// Split out so tests can inject a fixed tool set without a live OpenAPI fetch.
export function buildServer(client: MonarkClient, tools: GeneratedTool[]): Server {
  const server = new Server({ name: "monark", version: "1.0.0" }, { capabilities: { tools: {} } });
  const byName = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${req.params.name}` }],
        isError: true,
      };
    }
    try {
      const result = await executeTool(
        client,
        tool,
        (req.params.arguments ?? {}) as Record<string, unknown>,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result ?? { ok: true }, null, 2) }],
      };
    } catch (err) {
      const message =
        err instanceof MonarkApiError
          ? `${err.status} ${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Unknown error";
      return { content: [{ type: "text" as const, text: message }], isError: true };
    }
  });

  return server;
}
