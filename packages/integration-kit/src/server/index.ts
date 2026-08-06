// @monark/integration-kit/server — shared plumbing for automation integrations
// (a service that plugs into the automation engine via an inbound webhook +
// action nodes). Provider-agnostic; each integration supplies the specifics.
export {
  defineInboundWebhook,
  verifyHmacSha256,
  constantTimeEquals,
  type InboundWebhookParams,
  type InboundWebhookResult,
} from "./webhook";
export { makeConnectionSecretRouter } from "./connection";
export { createRestClient, pickString, pickNumber } from "./rest";
