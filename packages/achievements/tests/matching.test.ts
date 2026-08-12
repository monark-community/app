import { describe, expect, it } from "vitest";
import {
  payloadMatches,
  recipientsFor,
  ruleEventTypeMatches,
  subjectsOf,
} from "../src/contracts/matching";

const evt = (over: Record<string, unknown>) => ({ type: "kanban.card-created", ...over });

describe("ruleEventTypeMatches", () => {
  it("matches the event type or one of its subscription aliases", () => {
    expect(ruleEventTypeMatches("kanban.card-created", evt({}))).toBe(true);
    expect(
      ruleEventTypeMatches("data-models.tasks-record-created", {
        type: "data-models.record-created",
        subscriptionAliases: ["data-models.tasks-record-created"],
      }),
    ).toBe(true);
    expect(ruleEventTypeMatches("kanban.card-moved", evt({}))).toBe(false);
  });
});

describe("payloadMatches", () => {
  it("passes with no matchers, honours equality, rejects missing", () => {
    expect(payloadMatches(null, evt({}))).toBe(true);
    expect(payloadMatches({ toColumnId: "done" }, evt({ toColumnId: "done" }))).toBe(true);
    expect(payloadMatches({ toColumnId: "done" }, evt({ toColumnId: "todo" }))).toBe(false);
    expect(payloadMatches({ toColumnId: "done" }, evt({}))).toBe(false);
  });
  it("compares via string coercion", () => {
    expect(payloadMatches({ count: "3" }, evt({ count: 3 }))).toBe(true);
  });
});

describe("subjectsOf", () => {
  it("reads a scalar or array field, else nothing", () => {
    expect(subjectsOf(evt({ actorId: "u1" }), "actorId")).toEqual(["u1"]);
    expect(subjectsOf(evt({ assigneeIds: ["u1", "u2", ""] }), "assigneeIds")).toEqual(["u1", "u2"]);
    expect(subjectsOf(evt({}), "actorId")).toEqual([]);
    expect(subjectsOf(evt({ actorId: 42 }), "actorId")).toEqual([]);
  });
});

describe("recipientsFor", () => {
  it("composes type + payload + subject, deduped", () => {
    expect(
      recipientsFor(
        { eventType: "kanban.card-created", subjectField: "actorId" },
        evt({ actorId: "u1" }),
      ),
    ).toEqual(["u1"]);
    expect(
      recipientsFor(
        { eventType: "kanban.card-created", subjectField: "assigneeIds" },
        evt({ assigneeIds: ["u1", "u1", "u2"] }),
      ),
    ).toEqual(["u1", "u2"]);
  });
  it("returns none for a wrong type or a failed payload match", () => {
    expect(
      recipientsFor(
        { eventType: "kanban.card-moved", subjectField: "actorId" },
        evt({ actorId: "u1" }),
      ),
    ).toEqual([]);
    expect(
      recipientsFor(
        {
          eventType: "kanban.card-created",
          subjectField: "actorId",
          match: { toColumnId: "done" },
        },
        evt({ actorId: "u1", toColumnId: "todo" }),
      ),
    ).toEqual([]);
  });
});
