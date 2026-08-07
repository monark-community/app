import type { DomainEventBase } from "@monark/common/contracts/events";

// Twitter/X is a write-only integration : X exposes no inbound event webhook on
// any accessible API tier (real-time delivery is Enterprise-only Account
// Activity), so this module emits no domain events and contributes no triggers —
// only action nodes that post to X. The union stays `never` so gen:events wires
// it in as a no-op.

export type TwitterEvents = DomainEventBase & { type: never };
