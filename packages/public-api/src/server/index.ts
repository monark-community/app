// @monark/public-api/server — the framework-agnostic toolkit for the curated
// REST + OpenAPI facade. It deliberately exports NO tRPC router : the public
// API is not a tRPC surface, it is a REST layer that (in services/api) drives
// the existing tRPC procedures through a server-side caller. This package owns
// the reusable, transport-agnostic pieces ; services/api owns the descriptors,
// the Express mount, and the API-key auth + rate-limit middleware.

export {
  type HttpMethod,
  type RouteDescriptor,
  type RouteHandlerArgs,
  type RoutePrincipal,
  type RouteRequestSchemas,
  type McpDecision,
  type McpToolConfig,
} from "./routes";

export { buildOpenApiSpec, zodToJsonSchema, type OpenApiInfo } from "./openapi";

export {
  registerPublicApiFeatureFlags,
  PUBLIC_API_ENABLED_FLAG,
  PUBLIC_API_SERVICE_ACCOUNTS_FLAG,
} from "./flags";
