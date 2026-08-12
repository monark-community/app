import { getDb, Prisma, trigramMatch, trigramOrder } from "@monark/db";
import { blocksToText, type DocumentBlock } from "@monark/common/blocks";
import { DEFAULT_COLUMNS, type KanbanCardPriority } from "../contracts/types";

export type KanbanBoardRow = Prisma.KanbanBoardGetPayload<{
  include: { roleAccess: true };
}>;
export type KanbanColumnRow = Prisma.KanbanColumnGetPayload<Record<string, never>>;
// `description` is a JSON column (a BlockNote block array) ; expose it as
// `unknown` so callers coerce it rather than leaking the recursive
// `Prisma.JsonValue`, which pushed tRPC's output inference past tsc's
// instantiation-depth limit (TS2589) in the web client on this wide row.
export type KanbanCardRow = Omit<
  Prisma.KanbanCardGetPayload<Record<string, never>>,
  "description"
> & {
  description: unknown;
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
    // Exclude machine principals (service accounts) from the member picker.
    where: { organizationId, leftAt: null, user: { is: { kind: "HUMAN" } } },
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

/**
 * Like {@link listCardsForBoard} but AND-ed with a compiled MonarkQL predicate
 * (from `compileKanbanFilter`). Board scope + soft-delete are always applied ;
 * `where` only narrows further. Same board-bounded, unpaginated read.
 */
export async function listCardsForBoardWithQuery(
  boardId: string,
  where?: Prisma.KanbanCardWhereInput,
): Promise<KanbanCardRow[]> {
  return getDb().kanbanCard.findMany({
    where: { boardId, deletedAt: null, ...where },
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
 * Fuzzy card search (trigram `pg_trgm`, typo-tolerant) over title + the
 * `descriptionText` projection, across a caller-provided set of accessible board
 * ids (row-level access already resolved by the router, mirroring the calendar's
 * `searchCalendarEvents`). Ranked by best similarity, bounded by `limit`. Returns
 * each card's board name for the result subtitle. Raw SQL (Prisma can't do
 * similarity).
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
  const columns = ["title", "descriptionText"];
  return getDb().$queryRaw<KanbanCardSearchHit[]>(Prisma.sql`
    SELECT c.id, c.title, c."boardId", b.name AS "boardName"
    FROM "KanbanCard" c
    JOIN "KanbanBoard" b ON b.id = c."boardId"
    WHERE c."organizationId" = ${organizationId}
      AND c."boardId" IN (${Prisma.join(boardIds)})
      AND c."deletedAt" IS NULL
      AND ${trigramMatch(columns, query, { alias: "c" })}
    ORDER BY ${trigramOrder(columns, query, { alias: "c" })}, c."updatedAt" DESC
    LIMIT ${limit}
  `);
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
}: {
  boardId: string;
  columnId: string;
  organizationId: string;
  title: string;
  description?: DocumentBlock[];
  assigneeIds?: string[];
  reviewerIds?: string[];
  dueAt?: Date | null;
  priority?: KanbanCardPriority | null;
  estimate?: number | null;
}): Promise<KanbanCardRow> {
  const db = getDb();
  const count = await db.kanbanCard.count({ where: { columnId, deletedAt: null } });
  return db.kanbanCard.create({
    data: {
      boardId,
      columnId,
      organizationId,
      title,
      description: (description ?? []) as Prisma.InputJsonValue,
      descriptionText: blocksToText(description ?? []),
      assigneeIds: assigneeIds ?? [],
      reviewerIds: reviewerIds ?? [],
      dueAt,
      priority,
      estimate,
      position: (count + 1) * POSITION_STEP,
    },
  });
}

export async function updateCard(
  id: string,
  patch: {
    title?: string;
    description?: DocumentBlock[];
    // `undefined` leaves the set untouched ; an array (even empty) replaces it.
    assigneeIds?: string[];
    reviewerIds?: string[];
    dueAt?: Date | null;
    priority?: KanbanCardPriority | null;
    estimate?: number | null;
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
  // `description` is a JSON column ; pull it out so it's cast to Prisma's JSON
  // input rather than spread as a typed array (which the update input won't
  // accept). Writing it also refreshes its text projection.
  const { description, ...rest } = patch;
  return db.kanbanCard.update({
    where: { id },
    data: {
      ...rest,
      ...(description !== undefined
        ? {
            description: description as Prisma.InputJsonValue,
            descriptionText: blocksToText(description),
          }
        : {}),
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

// ── Saved views (named MonarkQL queries per board) ───────

export type KanbanViewRow = Prisma.KanbanViewGetPayload<Record<string, never>>;

/** A board's saved views visible to `userId` : their own plus anyone's shared
 *  ones. Not cursor-paginated — a user's saved queries for one board are few. */
export async function listKanbanViews(boardId: string, userId: string): Promise<KanbanViewRow[]> {
  const db = getDb();
  return db.kanbanView.findMany({
    where: { boardId, OR: [{ createdBy: userId }, { shared: true }] },
    orderBy: [{ shared: "asc" }, { name: "asc" }, { id: "asc" }],
  });
}

export async function findKanbanViewById(id: string): Promise<KanbanViewRow | null> {
  const db = getDb();
  return db.kanbanView.findUnique({ where: { id } });
}

export async function createKanbanView(input: {
  boardId: string;
  organizationId: string;
  name: string;
  query: unknown;
  shared?: boolean;
  createdBy: string;
}): Promise<KanbanViewRow> {
  const db = getDb();
  return db.kanbanView.create({
    data: {
      boardId: input.boardId,
      organizationId: input.organizationId,
      name: input.name,
      query: input.query as Prisma.InputJsonValue,
      shared: input.shared ?? false,
      createdBy: input.createdBy,
    },
  });
}

export async function updateKanbanView(
  id: string,
  patch: { name?: string; query?: unknown; shared?: boolean },
): Promise<KanbanViewRow> {
  const db = getDb();
  return db.kanbanView.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.query !== undefined ? { query: patch.query as Prisma.InputJsonValue } : {}),
      ...(patch.shared !== undefined ? { shared: patch.shared } : {}),
    },
  });
}

export async function deleteKanbanView(id: string): Promise<void> {
  const db = getDb();
  await db.kanbanView.delete({ where: { id } });
}
