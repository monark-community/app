import { getDb, type Prisma } from "@monark/db";
import { DEFAULT_COLUMNS, type KanbanCardPriority, type KanbanSubtask } from "../contracts/types";

export type KanbanBoardRow = Prisma.KanbanBoardGetPayload<{
  include: { roleAccess: true };
}>;
export type KanbanColumnRow = Prisma.KanbanColumnGetPayload<Record<string, never>>;
// `subtasks` is a JSON column ; expose it as `unknown` (callers coerce it with
// `parseSubtasks`) rather than the recursive `Prisma.JsonValue`. On this
// already-wide row, the recursive type pushed tRPC's output inference past
// tsc's instantiation-depth limit (TS2589) in the web client.
export type KanbanCardRow = Omit<Prisma.KanbanCardGetPayload<Record<string, never>>, "subtasks"> & {
  subtasks: unknown;
};

// Ordering step. Columns and cards are numbered in gaps of this size so a
// single move renumbers only its own list (the house pattern from
// data-models' reorderDataFields).
const POSITION_STEP = 10;

// ── Boards ────────────────────────────────────────────────

/**
 * Every board the user may see. Unbounded on purpose (mirrors the calendar's
 * `listAccessibleCalendars`) : boards are an org-scoped, small set powering a
 * board switcher that wants them all at once. `kanban.manage` sees every board ;
 * otherwise a board is visible when it has no role restriction OR the user's
 * role is granted explicit access.
 */
export async function listAccessibleBoards({
  organizationId,
  roleIds,
  hasManagedPermission,
  includeDeleted = false,
}: {
  organizationId: string;
  roleIds: string[];
  hasManagedPermission: boolean;
  includeDeleted?: boolean;
}): Promise<KanbanBoardRow[]> {
  return getDb().kanbanBoard.findMany({
    where: {
      organizationId,
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(hasManagedPermission
        ? {}
        : {
            OR: [
              { roleAccess: { none: {} } },
              ...(roleIds.length > 0
                ? [{ roleAccess: { some: { roleId: { in: roleIds } } } }]
                : []),
            ],
          }),
    },
    include: { roleAccess: true },
    orderBy: { name: "asc" },
  });
}

export async function findBoardById(
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<KanbanBoardRow | null> {
  return getDb().kanbanBoard.findFirst({
    where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
    include: { roleAccess: true },
  });
}

/** Create a board and seed it with the default columns (in order). */
export async function createBoard({
  organizationId,
  name,
  description,
  color,
}: {
  organizationId: string;
  name: string;
  description?: string | null;
  color?: string | null;
}): Promise<KanbanBoardRow> {
  const db = getDb();
  const board = await db.$transaction(async (tx) => {
    const created = await tx.kanbanBoard.create({
      data: { organizationId, name, description, color },
    });
    await tx.kanbanColumn.createMany({
      data: DEFAULT_COLUMNS.map((col, index) => ({
        boardId: created.id,
        organizationId,
        name: col.name,
        color: col.color,
        position: (index + 1) * POSITION_STEP,
      })),
    });
    return created;
  });
  // Re-read with roleAccess so the shape matches the other board reads.
  const withAccess = await findBoardById(board.id);
  if (!withAccess) throw new Error("board vanished after create");
  return withAccess;
}

export async function updateBoard(
  id: string,
  patch: { name?: string; description?: string | null; color?: string | null },
): Promise<KanbanBoardRow> {
  return getDb().kanbanBoard.update({
    where: { id },
    data: patch,
    include: { roleAccess: true },
  });
}

export async function softDeleteBoard(id: string): Promise<void> {
  await getDb().kanbanBoard.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreBoard(id: string): Promise<void> {
  await getDb().kanbanBoard.update({ where: { id }, data: { deletedAt: null } });
}

/** Replace a board's role-access set (empty array = visible to everyone). */
export async function setBoardRoleAccess(boardId: string, roleIds: string[]): Promise<void> {
  const db = getDb();
  await db.$transaction([
    db.kanbanBoardRoleAccess.deleteMany({ where: { boardId } }),
    db.kanbanBoardRoleAccess.createMany({
      data: roleIds.map((roleId) => ({ boardId, roleId })),
      skipDuplicates: true,
    }),
  ]);
}

// ── Columns ───────────────────────────────────────────────

export async function listColumnsForBoard(boardId: string): Promise<KanbanColumnRow[]> {
  return getDb().kanbanColumn.findMany({
    where: { boardId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
}

export async function findColumnById(id: string): Promise<KanbanColumnRow | null> {
  return getDb().kanbanColumn.findUnique({ where: { id } });
}

export async function createColumn({
  boardId,
  organizationId,
  name,
  color,
  wipLimit,
}: {
  boardId: string;
  organizationId: string;
  name: string;
  color?: string | null;
  wipLimit?: number | null;
}): Promise<KanbanColumnRow> {
  const db = getDb();
  const count = await db.kanbanColumn.count({ where: { boardId } });
  return db.kanbanColumn.create({
    data: {
      boardId,
      organizationId,
      name,
      color,
      wipLimit,
      position: (count + 1) * POSITION_STEP,
    },
  });
}

export async function updateColumn(
  id: string,
  patch: { name?: string; color?: string | null; wipLimit?: number | null },
): Promise<KanbanColumnRow> {
  return getDb().kanbanColumn.update({ where: { id }, data: patch });
}

/** Hard-delete a column ; its cards cascade away (see the FK onDelete). */
export async function deleteColumn(id: string): Promise<void> {
  await getDb().kanbanColumn.delete({ where: { id } });
}

/**
 * Full-reorder : `orderedIds` is every column id for the board, in the desired
 * order. Positions are rewritten in steps of 10 inside a transaction.
 */
export async function reorderColumns(boardId: string, orderedIds: string[]): Promise<void> {
  const db = getDb();
  await db.$transaction(
    orderedIds.map((id, index) =>
      db.kanbanColumn.update({
        where: { id, boardId },
        data: { position: (index + 1) * POSITION_STEP },
      }),
    ),
  );
}

// ── Members ───────────────────────────────────────────────

export type OrgMember = {
  id: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
};

/**
 * Active members of an org, for the card-assignee picker + avatar resolution.
 * Bounded by one org (a small set) so it is intentionally not cursor-paginated,
 * mirroring the calendar's member read.
 */
export async function listOrgMembers({
  organizationId,
}: {
  organizationId: string;
}): Promise<OrgMember[]> {
  const memberships = await getDb().organizationMembership.findMany({
    where: { organizationId, leftAt: null },
    select: { user: { select: { id: true, displayName: true, email: true, avatarUrl: true } } },
    orderBy: { user: { displayName: "asc" } },
  });
  return memberships.map((m) => m.user);
}

// ── Cards ─────────────────────────────────────────────────

/**
 * All non-archived cards for one board (across its columns), ordered for
 * rendering. Bounded by a single board (mirrors the calendar's day-scoped
 * read), so it is intentionally not cursor-paginated.
 */
export async function listCardsForBoard(boardId: string): Promise<KanbanCardRow[]> {
  return getDb().kanbanCard.findMany({
    where: { boardId, deletedAt: null },
    orderBy: [{ columnId: "asc" }, { position: "asc" }, { id: "asc" }],
  });
}

export async function findCardById(
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<KanbanCardRow | null> {
  return getDb().kanbanCard.findFirst({
    where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
  });
}

/** One card matched by the global-search kanban provider. */
export type KanbanCardSearchHit = {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
};

/**
 * Cards whose title matches `query`, across a caller-provided set of accessible
 * board ids (row-level access already resolved by the router, mirroring the
 * calendar's `searchCalendarEvents`). Bounded by `limit` (a small palette page),
 * newest-updated first. Returns each card's board name for the result subtitle.
 */
export async function searchCards({
  organizationId,
  boardIds,
  query,
  limit = 8,
}: {
  organizationId: string;
  boardIds: string[];
  query: string;
  limit?: number;
}): Promise<KanbanCardSearchHit[]> {
  if (boardIds.length === 0) return [];
  const rows = await getDb().kanbanCard.findMany({
    where: {
      organizationId,
      boardId: { in: boardIds },
      deletedAt: null,
      title: { contains: query, mode: "insensitive" },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { id: true, title: true, boardId: true, board: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    boardId: r.boardId,
    boardName: r.board.name,
  }));
}

export async function createCard({
  boardId,
  columnId,
  organizationId,
  title,
  description,
  assigneeIds,
  reviewerIds,
  dueAt,
  priority,
  estimate,
  subtasks,
}: {
  boardId: string;
  columnId: string;
  organizationId: string;
  title: string;
  description?: string | null;
  assigneeIds?: string[];
  reviewerIds?: string[];
  dueAt?: Date | null;
  priority?: KanbanCardPriority | null;
  estimate?: number | null;
  subtasks?: KanbanSubtask[];
}): Promise<KanbanCardRow> {
  const db = getDb();
  const count = await db.kanbanCard.count({ where: { columnId, deletedAt: null } });
  return db.kanbanCard.create({
    data: {
      boardId,
      columnId,
      organizationId,
      title,
      description,
      assigneeIds: assigneeIds ?? [],
      reviewerIds: reviewerIds ?? [],
      dueAt,
      priority,
      estimate,
      subtasks: (subtasks ?? []) as Prisma.InputJsonValue,
      position: (count + 1) * POSITION_STEP,
    },
  });
}

export async function updateCard(
  id: string,
  patch: {
    title?: string;
    description?: string | null;
    // `undefined` leaves the set untouched ; an array (even empty) replaces it.
    assigneeIds?: string[];
    reviewerIds?: string[];
    dueAt?: Date | null;
    priority?: KanbanCardPriority | null;
    estimate?: number | null;
    // Inline checklist ; `undefined` leaves it untouched, an array replaces it.
    subtasks?: KanbanSubtask[];
    // Move the card to another column (the card form's status select). The card
    // is placed at the end of the target column ; caller passes this only when
    // the column actually changed.
    columnId?: string;
  },
): Promise<KanbanCardRow> {
  const db = getDb();
  let position: number | undefined;
  if (patch.columnId) {
    const count = await db.kanbanCard.count({
      where: { columnId: patch.columnId, deletedAt: null },
    });
    position = (count + 1) * POSITION_STEP;
  }
  // Subtasks is a JSON column ; pull it out so it's cast to Prisma's JSON input
  // rather than spread as a typed array (which its update input won't accept).
  const { subtasks, ...rest } = patch;
  return db.kanbanCard.update({
    where: { id },
    data: {
      ...rest,
      ...(subtasks !== undefined ? { subtasks: subtasks as Prisma.InputJsonValue } : {}),
      ...(position != null ? { position } : {}),
    },
  });
}

export async function softDeleteCard(id: string): Promise<void> {
  await getDb().kanbanCard.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Move `cardId` into `toColumnId` at the position implied by
 * `orderedIdsInTarget` — the full ordered list of card ids the target column
 * should contain after the move (including the moved card). In one transaction
 * every target card's `columnId` is pinned to `toColumnId` and its `position`
 * rewritten in steps of 10. The source column keeps its gaps (harmless).
 */
export async function moveCard(
  boardId: string,
  toColumnId: string,
  orderedIdsInTarget: string[],
): Promise<void> {
  const db = getDb();
  await db.$transaction(
    orderedIdsInTarget.map((id, index) =>
      db.kanbanCard.update({
        where: { id, boardId },
        data: { columnId: toColumnId, position: (index + 1) * POSITION_STEP },
      }),
    ),
  );
}
