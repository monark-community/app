---
type: how-to
---

# Add an automation node type

Add an action that flow builders can drop into an automation, such as "Create card" or "Send a Telegram message". The editor's palette and the run engine both pick it up from a registry. [Concepts](../../concepts/_index.md) explains how a flow runs around your node.

1. Define the node in `src/server/nodes.ts`:
   ```ts
   import { z } from "zod";
   import { defineNode } from "@monark/automation/server";

   export const publishPostNode = defineNode({
     descriptor: {
       kind: "action",
       category: "posts",
       label: "Posts: Publish post",
       description: "Publish a draft post.",
       icon: "Send",
       inputs: [{ id: "in" }],
       outputs: [{ id: "out" }],
       outputFields: [{ key: "postId", type: "string", description: "The published post." }],
       configFields: [{ key: "postId", label: "Post ID", type: "text", required: true }],
     },
     configSchema: z.object({ postId: z.string() }),
     execute: async (ctx, config) => {
       ctx.log(`publishing ${config.postId}`);
       return { postId: config.postId };
     },
   });
   ```
   `configFields` builds the form in the editor; `configSchema` validates it before `execute` runs. Labels are plain English and aren't translated.
2. Check the owner's permission inside `execute` for anything privileged. A flow runs as the person who created it, who may have lost access since:
   ```ts
   if (!ctx.actorUserId || !(await hasPermission(ctx.actorUserId, "posts.publish", ctx.organizationId))) {
     throw new Error('The automation owner lacks the "posts.publish" permission.');
   }
   ```
   `hasPermission` comes from `@monark/rbac/server`. Throwing fails this step.
3. Register the module's nodes once, and call the helper in `services/api/src/server.ts` next to the other automation nodes:
   ```ts
   registerAutomationNodes("posts", { "publish-post": publishPostNode });
   ```
   The node's type becomes `posts.publish-post`.
4. Open an automation in the editor. The node is in the palette under its category.

## Call an outside service with a secret

1. Add a secret field: `{ key: "token", label: "API token", type: "secret", required: true }`. The editor shows a dropdown of the organization's secret names and stores only the name.
2. In `execute`, resolve it and fail if it's missing:
   ```ts
   const token = await ctx.getSecret(config.token);
   if (!token) throw new Error(`No secret named ${config.token}.`);
   ```
3. Make the call with `safeFetch` from `@monark/common/http`, which blocks unsafe hosts and times out.
4. Return only non-sensitive data. Never pass the secret to `ctx.log` or include it in the output. See [Secrets](../../concepts/secrets.md).

Good to know:

- Each `outputFields` entry is offered downstream as `{{ steps.<node>.<key> }}`.
- For branching, call `ctx.activateOutputs(["<output id>"])`; a node that doesn't activates all its outputs.

Next: [Add a public API endpoint](add-a-public-api-endpoint.md)
