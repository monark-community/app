---
type: how-to
---

# Connect an agent through MCP

Let an AI agent host that speaks the Model Context Protocol, such as Claude Desktop or Cursor, read and write your organization's records as tools. The Monark MCP server runs on your machine and calls the public API with your key, so the agent can do exactly what the key can.

You need a clone of the Monark repository with dependencies installed, Node 22, and the public API turned on for your organization.

1. Create an API key for the agent. Prefer a [key with limited access](../public-api/create-a-key-with-limited-access.md): a read-only key gives a read-only agent.
2. Note the **Base URL** on the **API keys** page and drop the trailing `/api/v1`. That's your API origin, such as `https://api.example.com`.
3. Build the server:
   ```sh
   pnpm --filter @monark/mcp build
   ```
4. Add it to your agent host's MCP configuration. For Claude Desktop, edit `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "monark": {
         "command": "node",
         "args": ["<path-to-repo>/services/mcp/dist/index.js"],
         "env": {
           "MONARK_API_URL": "https://api.example.com",
           "MONARK_API_KEY": "mrk_..."
         }
       }
     }
   }
   ```
5. Restart the agent host. The Monark tools appear in its tool list.
6. Ask the agent to call `monark_whoami`. It answers with the user and organization the key acts as.

## Tools the agent gets

The server reads the API's OpenAPI document when it starts and turns every endpoint marked for agents into a tool, so new endpoints appear without updating the server. Today these are `monark_whoami`, `monark_list_models`, `monark_get_model`, `monark_list_model_fields`, `monark_list_records`, `monark_get_record`, `monark_create_record`, `monark_update_record` and `monark_delete_record`. The [Public API reference](../../reference/public-api.md#endpoints) maps each to its endpoint.

Good to know:

- If the server exits at start, the host's log shows why on stderr: a missing variable, an unreachable API, or the public API being off.
- Only tools are offered; there are no MCP resources or prompts. The server speaks stdio only, so it runs alongside the host, not as a remote service.

Next: [Use the OpenAPI spec](use-the-openapi-spec.md)
