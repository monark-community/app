import { describe, it, expect } from "vitest";
import type { DomainEvent } from "@monark/common/contracts/events";
import { DATA_RECORD_TRIGGER_TYPE, EVENT_TRIGGER_TYPE } from "../src/contracts/triggers";
import { eventScopeMatches } from "../src/server/subscriber";
import type { AutomationRow } from "../src/server/data";

/** Minimal `AutomationRow` — `eventScopeMatches` only reads `.graph`. */
function rowWithTrigger(triggerType: string, config: Record<string, unknown>): AutomationRow {
  return {
    graph: {
      nodes: [{ id: "t1", type: triggerType, position: { x: 0, y: 0 }, config }],
      edges: [],
    },
  } as unknown as AutomationRow;
}

function recordCreated(dataModelKey: string): DomainEvent {
  return {
    type: "data-models.record-created",
    dataModelKey,
    occurredAt: new Date(),
  } as unknown as DomainEvent;
}

describe("eventScopeMatches", () => {
  it("fires only for the Data Record trigger's chosen model", () => {
    const row = rowWithTrigger(DATA_RECORD_TRIGGER_TYPE, {
      dataModelKey: "customers",
      operation: "created",
    });
    expect(eventScopeMatches(row, recordCreated("customers"))).toBe(true);
    expect(eventScopeMatches(row, recordCreated("orders"))).toBe(false);
  });

  it("fires for all models when the Data Record trigger has no model set", () => {
    const row = rowWithTrigger(DATA_RECORD_TRIGGER_TYPE, { operation: "created" });
    expect(eventScopeMatches(row, recordCreated("anything"))).toBe(true);
  });

  it("does not scope a generic Event Trigger on a record event", () => {
    const row = rowWithTrigger(EVENT_TRIGGER_TYPE, { eventType: "data-models.record-created" });
    expect(eventScopeMatches(row, recordCreated("customers"))).toBe(true);
    expect(eventScopeMatches(row, recordCreated("orders"))).toBe(true);
  });

  it("ignores scoping for non-record events", () => {
    const row = rowWithTrigger(DATA_RECORD_TRIGGER_TYPE, {
      dataModelKey: "customers",
      operation: "created",
    });
    const nonRecord = {
      type: "kanban.card-created",
      occurredAt: new Date(),
    } as unknown as DomainEvent;
    expect(eventScopeMatches(row, nonRecord)).toBe(true);
  });

  it("fails open on a malformed graph", () => {
    const row = { graph: "not a graph" } as unknown as AutomationRow;
    expect(eventScopeMatches(row, recordCreated("customers"))).toBe(true);
  });
});
