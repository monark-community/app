import { z, ZodError, type ZodTypeAny } from "zod";
import { AppError } from "@monark/common";
import {
  zodToJsonSchema,
  type RouteDescriptor,
  type RoutePrincipal,
} from "@monark/public-api/server";
import type {
  AgentToolSpec,
  ChatToolExecutor,
  ChatUserContext,
  ToolExecuteResult,
} from "@monark/chat/server";
import { makeCaller, type AppCaller } from "../public/caller";
import { V1_ROUTES } from "../public/routes";
import { automationTools } from "./automation-tools";
import { wikiTools } from "./wiki-tools";
import { navTools } from "./nav-tools";

// An in-app-only agent tool: not derived from a public V1_ROUTE, it runs a
// closure over the in-process caller (as the logged-in user). Used for surfaces
// we deliberately keep OFF the public API / MCP (e.g. automations). Input is
// validated by its own zod schema, which also drives the LLM tool spec.
export interface InAppTool {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  mutates: boolean;
  run: (caller: AppCaller, input: unknown) => Promise<unknown>;
}

// Builds the in-app AI agent's toolset from the SAME `V1_ROUTES` that drive the
// external MCP server — one registry, two adapters. MCP exposes the routes over
// stdio to third-party agents; here we expose them in-process to the app-owned
// agent. Execution goes through the identical server-side tRPC caller
// (createCaller over appRouter), so a tool runs as the logged-in user with all
// of their RBAC, per-record access, event emission, and validation reused
// verbatim — no HTTP hop, no API key, no separate authorization path.
//
// A route is a tool iff it made the `mcp: { expose }` decision. The tool's flat
// input schema is the union of its path params + query fields + body fields
// (they don't collide across the v1 routes); on execution we re-split and let
// each route's own zod schemas validate, exactly like the Express mount does.

function pathParamNames(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1] ?? "").filter(Boolean);
}

function objectShape(schema: ZodTypeAny | undefined): Record<string, ZodTypeAny> | null {
  return schema instanceof z.ZodObject ? (schema.shape as Record<string, ZodTypeAny>) : null;
}

function isRequired(field: ZodTypeAny): boolean {
  return !(field instanceof z.ZodOptional || field instanceof z.ZodDefault);
}

function buildInputSchema(route: RouteDescriptor<AppCaller>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const name of pathParamNames(route.path)) {
    properties[name] = { type: "string" };
    required.push(name);
  }
  for (const src of [objectShape(route.request?.query), objectShape(route.request?.body)]) {
    if (!src) continue;
    for (const [key, field] of Object.entries(src)) {
      properties[key] = zodToJsonSchema(field);
      if (isRequired(field)) required.push(key);
    }
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function toErrorMessage(err: unknown): string {
  if (err instanceof ZodError) {
    return `Invalid arguments: ${err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`;
  }
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return "The tool failed.";
}

export function buildChatToolset(): ChatToolExecutor {
  const exposed = V1_ROUTES.filter(
    (
      r,
    ): r is RouteDescriptor<AppCaller> & {
      mcp: { expose: { name: string; description: string } };
    } => "expose" in r.mcp,
  );

  const routeSpecs: AgentToolSpec[] = exposed.map((route) => ({
    name: route.mcp.expose.name,
    description: route.mcp.expose.description,
    inputSchema: buildInputSchema(route),
    // Anything that isn't a plain read mutates → gets confirm-gated.
    mutates: route.method !== "get",
  }));
  const routeByName = new Map(exposed.map((r) => [r.mcp.expose.name, r]));

  // In-app-only tools (automation, wiki, …) merged alongside the route-derived ones.
  const inAppTools = [...automationTools, ...wikiTools, ...navTools];
  const extraByName = new Map(inAppTools.map((t) => [t.name, t]));
  const extraSpecs: AgentToolSpec[] = inAppTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema),
    mutates: t.mutates,
  }));

  const specs: AgentToolSpec[] = [...routeSpecs, ...extraSpecs];
  const specByName = new Map(specs.map((s) => [s.name, s]));

  return {
    listSpecs: () => specs,
    getSpec: (name) => specByName.get(name) ?? null,
    execute: async ({
      ctx,
      toolName,
      input,
    }: {
      ctx: ChatUserContext;
      toolName: string;
      input: unknown;
    }): Promise<ToolExecuteResult> => {
      const flat = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;

      // In-app tool: validate with its own zod schema, run the closure over the caller.
      const extra = extraByName.get(toolName);
      if (extra) {
        try {
          const parsed = extra.inputSchema.parse(flat);
          const caller = makeCaller({ userId: ctx.userId, organizationId: ctx.organizationId });
          const result = await extra.run(caller, parsed);
          return { ok: true, result: result ?? null };
        } catch (err) {
          return { ok: false, error: toErrorMessage(err) };
        }
      }

      const route = routeByName.get(toolName);
      if (!route) return { ok: false, error: `Unknown tool: ${toolName}` };
      try {
        const params: Record<string, string> = {};
        for (const name of pathParamNames(route.path)) params[name] = String(flat[name] ?? "");
        // z.object strips unknown keys, so parsing the flat input against each
        // schema cleanly separates query vs body (and drops path params).
        const query = route.request?.query ? route.request.query.parse(flat) : {};
        const body = route.request?.body ? route.request.body.parse(flat) : {};

        const caller = makeCaller({ userId: ctx.userId, organizationId: ctx.organizationId });
        const principal: RoutePrincipal = {
          apiKeyId: "chat-agent",
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          fullAccess: true,
          permissions: [],
        };

        const result = await route.handler({ caller, principal, params, query, body });
        return { ok: true, result: result ?? null };
      } catch (err) {
        return { ok: false, error: toErrorMessage(err) };
      }
    },
  };
}
