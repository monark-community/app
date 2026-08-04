import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config";
import { MonarkClient } from "./client";
import { createMcpServer } from "./server";

// Entrypoint : a stdio MCP server. An MCP host (Claude Desktop, Cursor, …)
// launches this process and speaks the protocol over stdin/stdout — so ALL
// diagnostics MUST go to stderr, never stdout (stdout is the protocol channel).

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new MonarkClient(config);
  // Fetches the deployment's OpenAPI to build its tools ; fails fast (below) if
  // the API is unreachable or the public API isn't enabled.
  const server = await createMcpServer(client);
  await server.connect(new StdioServerTransport());
  console.error(`monark-mcp: connected, acting against ${config.apiUrl}/api/v1`);
}

main().catch((err: unknown) => {
  console.error(`monark-mcp: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
