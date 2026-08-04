import type { DomainEvent } from "./contracts/events";
import { on, WILDCARD_EVENT_TYPE } from "./events";

/**
 * A tiny in-memory ring buffer of recently-emitted domain events, for the
 * dev-overlay "event bus tap". The domain bus is best-effort and otherwise
 * invisible at runtime; recording every emit lets a developer see what fired
 * when they clicked something. Dev-only — install it from the API boot behind a
 * `NODE_ENV !== "production"` guard, and gate the read procedure the same way.
 */
export type DevEventEntry = {
  /** Monotonic sequence number (newest = highest). */
  seq: number;
  type: string;
  /** ISO timestamp of the event's `occurredAt`. */
  occurredAt: string;
  /** Shallow JSON of the payload (minus type/occurredAt), truncated. */
  summary: string;
};

const BUFFER_MAX = 100;
const buffer: DevEventEntry[] = [];
let seq = 0;
let installed = false;

function summarize(event: DomainEvent): string {
  try {
    const {
      type: _type,
      occurredAt: _occurredAt,
      ...rest
    } = event as unknown as Record<string, unknown>;
    void _type;
    void _occurredAt;
    const json = JSON.stringify(rest);
    return json.length > 240 ? `${json.slice(0, 240)}…` : json;
  } catch {
    return "";
  }
}

/**
 * Register a wildcard subscriber that records every emit into the ring buffer.
 * Idempotent; call once at boot (dev only).
 */
export function installDevEventTap(): void {
  if (installed) return;
  installed = true;
  on(WILDCARD_EVENT_TYPE, (event) => {
    seq += 1;
    const at = event.occurredAt instanceof Date ? event.occurredAt : new Date();
    buffer.push({ seq, type: event.type, occurredAt: at.toISOString(), summary: summarize(event) });
    if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
  });
}

/** Newest-first snapshot of the recorded events (up to `limit`). */
export function recentDevEvents(limit = 50): DevEventEntry[] {
  return buffer.slice(-limit).reverse();
}
