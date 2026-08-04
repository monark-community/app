import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { fieldKindsFrom, parseQuery } from "@monark/query/contracts";
import { KANBAN_QUERY_FIELD_KINDS } from "../../src/contracts/query-fields";
import { compileKanbanFilter } from "../../src/server/query-compiler";
import {
  createBoard,
  createCard,
  listCardsForBoardWithQuery,
  listColumnsForBoard,
} from "../../src/server/data";

// Exercises the Kanban MonarkQL compiler end-to-end against a real Postgres
// testcontainer : DSL text → FilterNode → compileKanbanFilter → Prisma where →
// rows. Covers each operator family, `@me`/date variables, ordered-priority
// range expansion, presence, and boolean composition.

const ORG = "kanban-query-org";
const NOW = new Date("2026-08-10T12:00:00.000Z");
const ADA = "u-ada";
const ALAN = "u-alan";

const kinds = fieldKindsFrom(
  Object.entries(KANBAN_QUERY_FIELD_KINDS).map(([key, kind]) => ({ key, kind })),
);

let boardId: string;
let todoId: string;
let backlogId: string;

async function titlesFor(text: string, userId = ADA): Promise<string[]> {
  const tree = parseQuery(text, kinds);
  const where = tree ? compileKanbanFilter(tree, { userId, now: NOW }) : undefined;
  const cards = await listCardsForBoardWithQuery(boardId, where);
  return cards.map((c) => c.title).sort();
}

beforeAll(async () => {
  await getDb().organization.upsert({
    where: { id: ORG },
    create: { id: ORG, slug: ORG, displayName: ORG },
    update: {},
  });
  const board = await createBoard({ organizationId: ORG, name: "Query Board" });
  boardId = board.id;
  const columns = await listColumnsForBoard(board.id);
  todoId = columns.find((c) => c.name === "Todo")!.id;
  backlogId = columns.find((c) => c.name === "Backlog")!.id;

  await createCard({
    organizationId: ORG,
    boardId,
    columnId: todoId,
    title: "Ship the API",
    assigneeIds: [ADA],
    priority: "HIGH",
    dueAt: new Date("2026-08-05T00:00:00.000Z"),
    estimate: 3,
  });
  await createCard({
    organizationId: ORG,
    boardId,
    columnId: backlogId,
    title: "Fix the bug",
    assigneeIds: [ADA, ALAN],
    priority: "CRITICAL",
    dueAt: new Date("2026-08-20T00:00:00.000Z"),
    estimate: 8,
  });
  await createCard({
    organizationId: ORG,
    boardId,
    columnId: todoId,
    title: "Write docs",
    assigneeIds: [],
    priority: "LOW",
    dueAt: null,
    estimate: null,
  });
});

afterAll(async () => {
  await truncate(getDb(), ["KanbanCard", "KanbanColumn", "KanbanBoardRoleAccess", "KanbanBoard"]);
  await getDb().organization.deleteMany({ where: { id: ORG } });
});

describe("kanban query compiler", () => {
  it("no filter returns every card", async () => {
    expect(await titlesFor("")).toEqual(["Fix the bug", "Ship the API", "Write docs"]);
  });

  it("text contains (case-insensitive)", async () => {
    expect(await titlesFor("title:~THE")).toEqual(["Fix the bug", "Ship the API"]);
    expect(await titlesFor("title:~docs")).toEqual(["Write docs"]);
  });

  it("status (columnId) membership", async () => {
    expect(await titlesFor(`status:${todoId}`)).toEqual(["Ship the API", "Write docs"]);
    expect(await titlesFor(`status:${backlogId}`)).toEqual(["Fix the bug"]);
  });

  it("assignee multi-select + @me", async () => {
    expect(await titlesFor("assignee:@me", ADA)).toEqual(["Fix the bug", "Ship the API"]);
    expect(await titlesFor(`assignee:&${ADA},${ALAN}`)).toEqual(["Fix the bug"]); // hasAllOf
    expect(await titlesFor(`-assignee:${ADA}`)).toEqual(["Write docs"]); // hasNoneOf
    expect(await titlesFor("assignee:empty")).toEqual(["Write docs"]);
  });

  it("ordered priority range expansion", async () => {
    expect(await titlesFor("priority:>=HIGH")).toEqual(["Fix the bug", "Ship the API"]);
    expect(await titlesFor("priority:>HIGH")).toEqual(["Fix the bug"]); // only CRITICAL
    expect(await titlesFor("priority:<HIGH")).toEqual(["Write docs"]); // only LOW
    expect(await titlesFor("priority:CRITICAL,LOW")).toEqual(["Fix the bug", "Write docs"]);
  });

  it("date comparisons + presence", async () => {
    expect(await titlesFor("due:>2026-08-10")).toEqual(["Fix the bug"]);
    expect(await titlesFor("due:<2026-08-10")).toEqual(["Ship the API"]);
    expect(await titlesFor("due:present")).toEqual(["Fix the bug", "Ship the API"]);
    expect(await titlesFor("due:empty")).toEqual(["Write docs"]);
  });

  it("number comparisons + presence", async () => {
    expect(await titlesFor("estimate:>=8")).toEqual(["Fix the bug"]);
    expect(await titlesFor("estimate:present")).toEqual(["Fix the bug", "Ship the API"]);
    expect(await titlesFor("estimate:empty")).toEqual(["Write docs"]);
  });

  it("boolean composition (implicit AND, OR)", async () => {
    expect(await titlesFor(`status:${todoId} priority:>=HIGH`)).toEqual(["Ship the API"]);
    expect(await titlesFor("priority:CRITICAL OR estimate:<5")).toEqual([
      "Fix the bug",
      "Ship the API",
    ]);
  });

  it("rejects an unknown query variable", async () => {
    const tree = parseQuery("assignee:@nobody", kinds);
    expect(() => compileKanbanFilter(tree!, { userId: ADA, now: NOW })).toThrow(/variable/i);
  });
});
