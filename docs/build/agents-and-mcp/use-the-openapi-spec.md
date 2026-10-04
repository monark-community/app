---
type: how-to
---

# Use the OpenAPI spec

Point a tool that understands OpenAPI 3, such as an SDK generator, Postman, Insomnia or an agent framework, at Monark's spec so it learns every endpoint, parameter and response shape.

1. Fetch the spec. It needs no key, but the public API must be on:
   ```sh
   curl https://api.example.com/api/v1/openapi.json -o monark-openapi.json
   ```
   Use your own Base URL from the **API keys** page. A `404` means the public API is off.
2. Import the file, or give the tool the URL directly.
3. Configure the tool's bearer authentication with an `mrk_` key. The spec declares the scheme, so most tools prompt for it.
4. Make a test call to `GET /me` from the tool.

For example, to generate a TypeScript client:

```sh
npx @openapitools/openapi-generator-cli generate \
  -i monark-openapi.json -g typescript-fetch -o ./monark-client
```

## Fields agents can use

Each operation carries two extensions beyond standard OpenAPI:

- `x-required-permission`: the permission the key's owner needs for the call. Use it to tell a user which role a key needs, or to hide actions an agent can't take.
- `x-mcp-tool`: a tool name and a description written for a language model. Use them as tool definitions if you're wiring the API into your own agent rather than through the [MCP server](connect-an-agent-through-mcp.md).

Good to know:

- The spec is built from the same route definitions that serve requests, so it always matches the deployed API.
- Paths in the spec are relative to the server URL `/api/v1`; prefix it with your API origin.
