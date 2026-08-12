import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@monark/db";
import { truncate } from "@monark/test-utils/db";
import { DEFAULT_COLUMN_NAMES, DEFAULT_COLUMNS } from "../../src/contracts/types";
import {
  createBoard,
  createCard,
  createColumn,
  findCardById,
  listCardsForBoard,
  listColumnsForBoard,
  moveCard,
  reorderColumns,
  searchCards,
  softDeleteCard,
  updateCard,
} from "../../src/server/data";

// Exercises the Kanban data layer against a real Postgres testcontainer,
// focused on the load-bearing ordering logic : columns and cards keep a
// gaps-of-10 `position`, a full-list reorder rewrites them, and moving a card
// re-columns + reindexes the target list.

const ORG = "kanban-org";

beforeAll(async () => {
  await getDb().organization.upsert({
    where: { id: ORG },
    create: { id: ORG, slug: ORG, displayName: ORG },
    update: {},
  });
});

afterEach(async () => {
  await truncate(getDb(), ["KanbanCard", "KanbanColumn", "KanbanBoardRoleAccess", "KanbanBoard"]);
});

afterAll(async () => {
  await getDb()
    .organization.delete({ where: { id: ORG } })
    .catch(() => {});
});

describe("kanban data layer", () => {
  it("seeds a new board with the default columns in order, with colours", async () => {
    const board = await createBoard({ organizationId: ORG, name: "Roadmap" });
    const columns = await listColumnsForBoard(board.id);
    expect(columns.map((c) => c.name)).toEqual([...DEFAULT_COLUMN_NAMES]);
    // Positions are assigned in steps of 10.
    expect(columns.map((c) => c.position)).toEqual([10, 20, 30, 40, 50, 60]);
    // Each seeded column carries its progression colour.
    expect(columns.map((c) => c.color)).toEqual(DEFAULT_COLUMNS.map((c) => c.color));
  });

  it("appends new columns and rewrites positions on reorder", async () => {
    const board = await createBoard({ organizationId: ORG, name: "Board" });
    const extra = await createColumn({ organizationId: ORG, boardId: board.id, name: "Blocked" });
    let columns = await listColumnsForBoard(board.id);
    expect(columns.at(-1)?.id).toBe(extra.id);
    expect(extra.position).toBe(70); // (6 existing + 1) * 10

    // Reverse the order ; positions become 10, 20, … in the new sequence.
    const reversed = [...columns].reverse().map((c) => c.id);
    await reorderColumns(board.id, reversed);
    columns = await listColumnsForBoard(board.id);
    expect(columns.map((c) => c.id)).toEqual(reversed);
    expect(columns.map((c) => c.position)).toEqual([10, 20, 30, 40, 50, 60, 70]);
  });

  it("moves a card to another column and reindexes the target", async () => {
    const board = await createBoard({ organizationId: ORG, name: "Board" });
    const columns = await listColumnsForBoard(board.id);
    const backlog = columns[0]!;
    const todo = columns[1]!;

    const a = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: backlog.id,
      title: "A",
    });
    const b = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: todo.id,
      title: "B",
    });
    const c = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: todo.id,
      title: "C",
    });

    // Move A into `todo`, dropped between B and C. Target order: B, A, C.
    await moveCard(board.id, todo.id, [b.id, a.id, c.id]);

    const cards = await listCardsForBoard(board.id);
    const todoCards = cards.filter((card) => card.columnId === todo.id);
    expect(todoCards.map((card) => card.title)).toEqual(["B", "A", "C"]);
    expect(todoCards.map((card) => card.position)).toEqual([10, 20, 30]);
    // A left the backlog column entirely.
    expect(cards.filter((card) => card.columnId === backlog.id)).toHaveLength(0);
  });

  it("searches cards by title within accessible boards, with board name + limit", async () => {
    const board = await createBoard({ organizationId: ORG, name: "Roadmap" });
    const other = await createBoard({ organizationId: ORG, name: "Other" });
    const [col] = await listColumnsForBoard(board.id);
    const [otherCol] = await listColumnsForBoard(other.id);
    await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: col!.id,
      title: "Ship the API",
    });
    const gone = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: col!.id,
      title: "Ship the docs",
    });
    await createCard({
      organizationId: ORG,
      boardId: other.id,
      columnId: otherCol!.id,
      title: "Shipping label", // matches "ship" but lives on a board we won't pass
    });

    // Case-insensitive title match, scoped to the board ids we pass.
    const hits = await searchCards({ organizationId: ORG, boardIds: [board.id], query: "ship" });
    expect(hits.map((h) => h.title).sort()).toEqual(["Ship the API", "Ship the docs"]);
    expect(hits.every((h) => h.boardName === "Roadmap")).toBe(true);

    // A soft-deleted card drops out.
    await softDeleteCard(gone.id);
    const afterDelete = await searchCards({
      organizationId: ORG,
      boardIds: [board.id],
      query: "ship",
    });
    expect(afterDelete.map((h) => h.title)).toEqual(["Ship the API"]);

    // No accessible boards → no results (never leaks the other board's card).
    expect(await searchCards({ organizationId: ORG, boardIds: [], query: "ship" })).toEqual([]);
  });

  it("stores multiple assignees (order-preserving) and replaces them on update", async () => {
    const board = await createBoard({ organizationId: ORG, name: "Board" });
    const [col] = await listColumnsForBoard(board.id);

    const created = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: col!.id,
      title: "Multi",
      assigneeIds: ["u-ada", "u-alan"],
    });
    expect(created.assigneeIds).toEqual(["u-ada", "u-alan"]);

    // An array (even a different set) replaces wholesale ; order is preserved.
    const updated = await updateCard(created.id, { assigneeIds: ["u-alan", "u-grace"] });
    expect(updated.assigneeIds).toEqual(["u-alan", "u-grace"]);

    // `undefined` leaves the set untouched (only the title changes here).
    const renamed = await updateCard(created.id, { title: "Renamed" });
    expect(renamed.assigneeIds).toEqual(["u-alan", "u-grace"]);

    // Clearing to an empty array removes everyone.
    await updateCard(created.id, { assigneeIds: [] });
    expect((await findCardById(created.id))?.assigneeIds).toEqual([]);

    // A card created with no assignees defaults to an empty array.
    const bare = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: col!.id,
      title: "Bare",
    });
    expect(bare.assigneeIds).toEqual([]);
  });

  it("stores multiple reviewers (order-preserving) and replaces them on update", async () => {
    const board = await createBoard({ organizationId: ORG, name: "Board" });
    const [col] = await listColumnsForBoard(board.id);

    const created = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: col!.id,
      title: "Rev",
      reviewerIds: ["r-ada", "r-alan"],
    });
    expect(created.reviewerIds).toEqual(["r-ada", "r-alan"]);

    // A new array replaces wholesale ; order preserved.
    const updated = await updateCard(created.id, { reviewerIds: ["r-alan", "r-grace"] });
    expect(updated.reviewerIds).toEqual(["r-alan", "r-grace"]);

    // `undefined` leaves the set untouched.
    const renamed = await updateCard(created.id, { title: "Rev2" });
    expect(renamed.reviewerIds).toEqual(["r-alan", "r-grace"]);

    // An empty array clears everyone.
    await updateCard(created.id, { reviewerIds: [] });
    expect((await findCardById(created.id))?.reviewerIds).toEqual([]);

    // Default is an empty array.
    const bare = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: col!.id,
      title: "Bare",
    });
    expect(bare.reviewerIds).toEqual([]);
  });

  it("stores the block-array description and keeps its text projection in sync", async () => {
    const board = await createBoard({ organizationId: ORG, name: "Board" });
    const [col] = await listColumnsForBoard(board.id);

    // The card's checklist now lives in the block body (a `checkListItem` block).
    const body = [
      { type: "paragraph", content: [{ type: "text", text: "hello", styles: {} }], children: [] },
      {
        type: "checkListItem",
        props: { checked: true },
        content: [{ type: "text", text: "done item", styles: {} }],
        children: [],
      },
    ];
    const created = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: col!.id,
      title: "Doc",
      description: body,
    });
    // The blocks round-trip through the JSONB column, and `descriptionText` is
    // the derived plain text (what the query language filters on).
    expect(created.description).toEqual(body);
    expect(created.descriptionText).toBe("hello\ndone item");

    // An array replaces the whole body ; the text projection follows.
    const next = [
      { type: "paragraph", content: [{ type: "text", text: "changed", styles: {} }], children: [] },
    ];
    const updated = await updateCard(created.id, { description: next });
    expect(updated.description).toEqual(next);
    expect(updated.descriptionText).toBe("changed");

    // A card created with no description defaults to an empty block array.
    const bare = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: col!.id,
      title: "Bare",
    });
    expect(bare.description).toEqual([]);
    expect(bare.descriptionText).toBe("");
  });

  it("moves a card to another column via updateCard(columnId), appending it (status change)", async () => {
    const board = await createBoard({ organizationId: ORG, name: "Board" });
    const columns = await listColumnsForBoard(board.id);
    const backlog = columns[0]!;
    const todo = columns[1]!;

    // Two cards already sitting in `todo` (positions 10, 20).
    await createCard({ organizationId: ORG, boardId: board.id, columnId: todo.id, title: "B" });
    await createCard({ organizationId: ORG, boardId: board.id, columnId: todo.id, title: "C" });
    const a = await createCard({
      organizationId: ORG,
      boardId: board.id,
      columnId: backlog.id,
      title: "A",
    });

    // Changing status = move to the end of the target column.
    const moved = await updateCard(a.id, { columnId: todo.id });
    expect(moved.columnId).toBe(todo.id);
    expect(moved.position).toBe(30); // (2 existing + 1) * 10

    const cards = await listCardsForBoard(board.id);
    expect(cards.filter((c) => c.columnId === backlog.id)).toHaveLength(0);
    expect(cards.filter((c) => c.columnId === todo.id).map((c) => c.title)).toEqual([
      "B",
      "C",
      "A",
    ]);
  });
});
