# The OpenAPI spec (for tools + agents)

`GET /api/v1/openapi.json` returns a standard OpenAPI 3 document describing every
route, its parameters, and its request/response shapes. Point an SDK generator,
an API client (Postman, Insomnia), or an AI agent at it and it can discover the
whole surface. Each route also advertises the RBAC permission it needs as
`x-required-permission`.

### AI agents (MCP)

For agent hosts that speak the **Model Context Protocol** (Claude Desktop,
Cursor, …), Monark ships an MCP server (`@monark/mcp`) that exposes these
endpoints as native tools. You give it your Monark URL + an `mrk_` key and the
agent can read and write your data directly, capped by that key's permissions.
Setup is in [services/mcp/README.md](../../../services/mcp/README.md).
