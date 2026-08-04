import type { ZodTypeAny } from "zod";

// The framework-agnostic description of one public-API endpoint. The service
// layer (services/api) supplies the concrete `TCaller` (a tRPC server-side
// caller) and wires each descriptor onto Express ; this package stays free of
// Express + the AppRouter type so it can also drive OpenAPI generation.

export type HttpMethod = "get" | "post" | "patch" | "delete";

// The authenticated caller behind a request : an API key resolved to the
// principal it acts as (a user, or a service-account machine row) + its org.
// Authority is 100% RBAC — the principal's roles decide what it can do. A key
// may additionally carry a permission CEILING (`fullAccess: false` + a subset of
// the owner's permissions), enforced by the mount before the caller runs.
export interface RoutePrincipal {
  apiKeyId: string;
  userId: string;
  organizationId: string;
  /** When false, the key is capped to `permissions` (a subset of the owner's). */
  fullAccess: boolean;
  /** The permission-ceiling allowlist (RBAC dotted keys) ; empty when fullAccess. */
  permissions: string[];
}

export interface RouteRequestSchemas {
  /** Validates + documents the query string. Must be a ZodObject to appear in OpenAPI params. */
  query?: ZodTypeAny;
  /** Validates + documents the JSON request body. */
  body?: ZodTypeAny;
}

/** How a route is exposed to AI agents over MCP. */
export interface McpToolConfig {
  /** The MCP tool name agents see, e.g. `monark_list_records` (`^monark_[a-z0-9_]+$`). */
  name: string;
  /** Agent-facing description — written for *when an agent should pick this tool*. */
  description: string;
}

/**
 * Every route must make an explicit MCP-visibility decision : `expose` it as an
 * agent tool (with a curated name + description), or `skip` it with a reason.
 * The field is REQUIRED on `RouteDescriptor`, so a new route can't compile
 * without deciding ; `check:mcp` additionally validates the decisions. The
 * OpenAPI carries `expose` decisions as `x-mcp-tool`, and the MCP server
 * auto-generates its tools from that — so a route decision is the single source
 * of truth for agent visibility.
 */
export type McpDecision = { expose: McpToolConfig } | { skip: string };

export interface RouteHandlerArgs<TCaller> {
  caller: TCaller;
  principal: RoutePrincipal;
  /** Path params, e.g. `{ key, id }`. */
  params: Record<string, string>;
  /** Parsed query (validated against `request.query` when provided). */
  query: unknown;
  /** Parsed body (validated against `request.body` when provided). */
  body: unknown;
}

export interface RouteDescriptor<TCaller = unknown> {
  method: HttpMethod;
  /** Express-style path relative to the /api/v1 base, e.g. "/models/:key/records". */
  path: string;
  summary: string;
  description?: string;
  /**
   * The RBAC permission the underlying procedure enforces (documentation only —
   * the procedure is the real gate). Surfaced in OpenAPI as
   * `x-required-permission` so a client knows which role a key's principal needs.
   * Omit for routes that only need a valid key (e.g. `/me`).
   */
  permission?: string;
  tags?: string[];
  request?: RouteRequestSchemas;
  /** Response shape, for OpenAPI documentation only (not validated at runtime). */
  response?: ZodTypeAny;
  /**
   * REQUIRED MCP-visibility decision : `{ expose }` to surface the route as an
   * agent tool, or `{ skip: "<reason>" }` to deliberately hide it. Forces an
   * explicit choice on every route (see {@link McpDecision}).
   */
  mcp: McpDecision;
  handler: (args: RouteHandlerArgs<TCaller>) => Promise<unknown>;
}
