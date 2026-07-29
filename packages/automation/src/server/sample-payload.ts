import { eventFieldsFor } from "@monark/common";

/** A recognizable placeholder for one event field, by declared type. */
export function sampleFieldValue(key: string, type: string): unknown {
  switch (type) {
    case "number":
      return 1;
    case "boolean":
      return true;
    case "date":
      return new Date().toISOString();
    case "object":
      return {};
    default:
      // Keep an email-shaped placeholder valid so a field wired into an
      // email-validated input (e.g. Send Email's `to`) still passes on a test.
      return /email/i.test(key) ? "sample@example.com" : `sample-${key}`;
  }
}

/**
 * The synthetic trigger payload for a manual "Run now". A real event-driven run
 * carries the actual event ; a manual test has none, so we shape one from the
 * event type's declared fields (see `eventFieldsFor`) with a placeholder per
 * field. Without this, `{{ trigger.<field> }}` references resolve to `undefined`
 * on a test run — which then fails any required input (e.g. Send Email's
 * `subject`), making a correctly-wired flow look broken. The base envelope
 * (type / org / actor / occurredAt) is authoritative and overrides any sample.
 */
export function sampleTriggerPayload(
  eventType: string,
  base: { organizationId: string; actorId: string },
): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  for (const f of eventFieldsFor(eventType)) sample[f.key] = sampleFieldValue(f.key, f.type);
  return {
    ...sample,
    type: eventType,
    organizationId: base.organizationId,
    actorId: base.actorId,
    manual: true,
    occurredAt: new Date().toISOString(),
  };
}
