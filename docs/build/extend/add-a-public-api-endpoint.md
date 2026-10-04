---
type: how-to
---

# Add a public API endpoint

Expose an existing procedure over the REST API, and decide whether agents get it as a tool. The endpoint, the OpenAPI spec and the MCP tool all come from one route definition.

1. Add a descriptor to `V1_ROUTES` in `services/api/src/public/routes.ts`:
   ```ts
   {
     method: "post",
     path: "/posts/:id/publish",
     summary: "Publish a draft post.",
     permission: "posts.publish",
     tags: ["posts"],
     mcp: {
       expose: {
         name: "monark_publish_post",
         description: "Publish a draft post by its id. Fetch the post first to confirm it is a draft.",
       },
     },
     handler: async ({ caller, params }) => caller.posts.publish({ id: params.id ?? "" }),
   },
   ```
   The handler calls the same tRPC procedure the web app uses, through `caller`, so permissions, validation and events stay in one place.
2. Set `permission` to the permission the procedure checks. It's published in the spec, and limited keys are refused before the procedure runs if they weren't granted it.
3. Add `request: { query, body }` zod schemas for any query string or body; they are validated and appear in the spec.
4. Make the MCP decision: `expose` with a `monark_` name and a description written for a language model, or `{ skip: "<reason>" }` for routes agents shouldn't call.
5. Run the checks:
   ```sh
   pnpm check:mcp
   pnpm --filter api test:integration
   ```
6. With the API running, fetch `/api/v1/openapi.json` and find your path in it.

Good to know:

- An exposed route also becomes a tool for the in-app assistant. Every method but `get` asks the user to confirm first.
- Add the endpoint to [Public API](../../reference/public-api.md).
- A handler that returns nothing sends `204`.

Next: [Give the assistant a new tool](add-an-assistant-tool.md)
