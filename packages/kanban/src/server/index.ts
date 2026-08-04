// Side-effect import: activates the "kanban.card.assigned" notification-kind
// augmentation for any compilation that imports @monark/kanban/server.
import "../contracts/notifications";
import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import {
  emit,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { getUserRoles, hasPermission, requirePermission } from "@monark/rbac/server";
import type {
  KanbanBoardCreatedEvent,
  KanbanCardAssignedEvent,
  KanbanCardCreatedEvent,
  KanbanCardDeletedEvent,
  KanbanCardMovedEvent,
  KanbanCardUpdatedEvent,
  KanbanColumnCreatedEvent,
} from "../contracts/events";
import { parseSubtasks, type KanbanSubtask } from "../contracts/types";
import { filterQuerySchema, type FilterNode } from "@monark/query/contracts";
import { compileKanbanFilter } from "./query-compiler";
import {
  createBoard,
  createCard,
  createColumn,
  createKanbanView,
  deleteColumn,
  deleteKanbanView,
  findBoardById,
  findCardById,
  findColumnById,
  findKanbanViewById,
  listAccessibleBoards,
  listCardsForBoard,
  listCardsForBoardWithQuery,
  listColumnsForBoard,
  listKanbanViews,
  listOrgMembers,
  moveCard,
  searchCards,
  reorderColumns,
  restoreBoard,
  setBoardRoleAccess,
  softDeleteBoard,
  softDeleteCard,
  updateBoard,
  updateCard,
  updateColumn,
  updateKanbanView,
  type KanbanViewRow,
} from "./data";

// Subtasks travel as a JSON-encoded string in the tRPC input, then get parsed +
// shape-validated here. A typed `z.array(z.object(...))` in the input inflated
// the inferred router type past tsc's instantiation-depth limit (TS2589) ; a
// plain string keeps the procedure input flat. `undefined` = leave untouched.
function parseSubtasksInput(raw: string | undefined): KanbanSubtask[] | undefined {
  if (raw === undefined) return undefined;
  try {
    return parseSubtasks(JSON.parse(raw));
  } catch {
    return [];
  }
}

// Builds the card-assigned event once (create + reassign share the shape).
function cardAssignedEvent(args: {
  boardId: string;
  boardName: string;
  cardId: string;
  cardTitle: string;
  organizationId: string;
  assigneeId: string;
  assignedById: string;
}): KanbanCardAssignedEvent {
  return { type: "kanban.card-assigned", ...args, occurredAt: new Date() };
}

async function resolveRoleIds(userId: string, orgId: string): Promise<string[]> {
  const roles = await getUserRoles(userId, orgId);
  return roles.map((r) => r.id);
}

async function resolveAccessibleBoardIds(userId: string, orgId: string): Promise<string[]> {
  const [roleIds, canManage] = await Promise.all([
    resolveRoleIds(userId, orgId),
    hasPermission(userId, "kanban.manage", orgId),
  ]);
  const boards = await listAccessibleBoards({
    organizationId: orgId,
    roleIds,
    hasManagedPermission: canManage,
  });
  return boards.map((b) => b.id);
}

/** Load a board the caller may access, or throw NotFound (also hides cross-org ids). */
async function requireAccessibleBoard(userId: string, orgId: string, boardId: string) {
  const accessibleIds = await resolveAccessibleBoardIds(userId, orgId);
  const board = await findBoardById(boardId);
  if (!board || board.organizationId !== orgId || !accessibleIds.includes(boardId)) {
    throw new NotFoundError("KanbanBoard", boardId);
  }
  return board;
}

export const kanbanRouter = router({
  // ── Boards ─────────────────────────────────────────────
  boards: router({
    list: publicProcedure
      .input(z.object({ includeDeleted: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.view", org.id);
        const [roleIds, canManage] = await Promise.all([
          resolveRoleIds(ctx.userId, org.id),
          hasPermission(ctx.userId, "kanban.manage", org.id),
        ]);
        return listAccessibleBoards({
          organizationId: org.id,
          roleIds,
          hasManagedPermission: canManage,
          includeDeleted: Boolean(input?.includeDeleted) && canManage,
        });
      }),

    // The board view's single data load: the board plus its columns and cards.
    get: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.view", org.id);
        const board = await requireAccessibleBoard(ctx.userId, org.id, input.id);
        const [columns, cards] = await Promise.all([
          listColumnsForBoard(board.id),
          listCardsForBoard(board.id),
        ]);
        // `subtasks` stays a JSON column here (the web coerces it with
        // `parseSubtasks`) — spreading the whole card row to retype it inflated
        // the inferred router type past tsc's instantiation-depth limit.
        return { board, columns, cards };
      }),

    create: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(120),
          description: z.string().max(500).nullable().optional(),
          color: z.string().max(7).nullable().optional(),
          roleIds: z.array(z.string().min(1)).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "kanban.create", org.id);
        const board = await createBoard({
          organizationId: org.id,
          name: input.name,
          description: input.description,
          color: input.color,
        });
        if (input.roleIds && input.roleIds.length > 0) {
          await setBoardRoleAccess(board.id, input.roleIds);
        }
        const event: KanbanBoardCreatedEvent = {
          type: "kanban.board-created",
          boardId: board.id,
          organizationId: org.id,
          name: board.name,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
        return findBoardById(board.id);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(120).optional(),
          description: z.string().max(500).nullable().optional(),
          color: z.string().max(7).nullable().optional(),
          roleIds: z.array(z.string().min(1)).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        // Editing a board's basic fields needs kanban.edit ; changing role
        // access additionally needs kanban.manage.
        await requirePermission(ctx, "kanban.edit", org.id);
        await requireAccessibleBoard(ctx.userId, org.id, input.id);
        const canManage = await hasPermission(ctx.userId, "kanban.manage", org.id);
        const updated = await updateBoard(input.id, {
          name: input.name,
          description: input.description,
          color: input.color,
        });
        if (input.roleIds !== undefined && canManage) {
          await setBoardRoleAccess(input.id, input.roleIds);
        }
        return updated;
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.delete", org.id);
        await requireAccessibleBoard(ctx.userId, org.id, input.id);
        await softDeleteBoard(input.id);
      }),

    restore: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.delete", org.id);
        const board = await findBoardById(input.id, { includeDeleted: true });
        if (!board || board.organizationId !== org.id) {
          throw new NotFoundError("KanbanBoard", input.id);
        }
        await restoreBoard(input.id);
      }),
  }),

  // ── Columns ────────────────────────────────────────────
  columns: router({
    create: publicProcedure
      .input(
        z.object({
          boardId: z.string().min(1),
          name: z.string().trim().min(1).max(80),
          color: z.string().max(7).nullable().optional(),
          wipLimit: z.number().int().min(1).max(999).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "kanban.edit", org.id);
        await requireAccessibleBoard(ctx.userId, org.id, input.boardId);
        const column = await createColumn({
          boardId: input.boardId,
          organizationId: org.id,
          name: input.name,
          color: input.color,
          wipLimit: input.wipLimit,
        });
        const event: KanbanColumnCreatedEvent = {
          type: "kanban.column-created",
          boardId: input.boardId,
          columnId: column.id,
          organizationId: org.id,
          name: column.name,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
        return column;
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(80).optional(),
          color: z.string().max(7).nullable().optional(),
          wipLimit: z.number().int().min(1).max(999).nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.edit", org.id);
        const column = await findColumnById(input.id);
        if (!column || column.organizationId !== org.id) {
          throw new NotFoundError("KanbanColumn", input.id);
        }
        await requireAccessibleBoard(ctx.userId, org.id, column.boardId);
        return updateColumn(input.id, {
          name: input.name,
          color: input.color,
          wipLimit: input.wipLimit,
        });
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.edit", org.id);
        const column = await findColumnById(input.id);
        if (!column || column.organizationId !== org.id) {
          throw new NotFoundError("KanbanColumn", input.id);
        }
        await requireAccessibleBoard(ctx.userId, org.id, column.boardId);
        await deleteColumn(input.id);
      }),

    reorder: publicProcedure
      .input(z.object({ boardId: z.string().min(1), orderedIds: z.array(z.string().min(1)) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.edit", org.id);
        await requireAccessibleBoard(ctx.userId, org.id, input.boardId);
        // The ordered set must be exactly the board's current columns.
        const columns = await listColumnsForBoard(input.boardId);
        const current = new Set(columns.map((c) => c.id));
        if (
          input.orderedIds.length !== current.size ||
          !input.orderedIds.every((id) => current.has(id))
        ) {
          throw new ValidationError("orderedIds must match the board's columns exactly");
        }
        await reorderColumns(input.boardId, input.orderedIds);
      }),
  }),

  // ── Members ────────────────────────────────────────────
  // Active org members for the card-assignee picker + avatar resolution.
  members: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, "kanban.view", org.id);
    return listOrgMembers({ organizationId: org.id });
  }),

  // ── Cards ──────────────────────────────────────────────
  cards: router({
    // Filtered board card load (MonarkQL). Same board-scoped read as
    // `boards.get`'s card slice, AND-ed with a compiled filter tree. Cards
    // inherit board access, so the board-access guard is the whole gate.
    list: publicProcedure
      .input(z.object({ boardId: z.string().min(1), filter: filterQuerySchema.optional() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.view", org.id);
        const board = await requireAccessibleBoard(ctx.userId, org.id, input.boardId);
        const where = input.filter
          ? compileKanbanFilter(input.filter, { userId: ctx.userId, now: new Date() })
          : undefined;
        return listCardsForBoardWithQuery(board.id, where);
      }),

    create: publicProcedure
      .input(
        z.object({
          boardId: z.string().min(1),
          columnId: z.string().min(1),
          title: z.string().trim().min(1).max(200),
          // Rich-text (HTML) description ; the markup makes it much larger than
          // the equivalent plain text, so the cap is generous.
          description: z.string().max(20000).nullable().optional(),
          assigneeIds: z.array(z.string().min(1)).max(20).optional(),
          reviewerIds: z.array(z.string().min(1)).max(20).optional(),
          dueAt: z.string().min(1).nullable().optional(),
          priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
          estimate: z.number().int().min(0).max(9999).nullable().optional(),
          subtasks: z.string().max(40000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "kanban.edit", org.id);
        const board = await requireAccessibleBoard(ctx.userId, org.id, input.boardId);
        const column = await findColumnById(input.columnId);
        if (!column || column.boardId !== input.boardId) {
          throw new NotFoundError("KanbanColumn", input.columnId);
        }
        const dueAt = parseOptionalDate(input.dueAt);
        const card = await createCard({
          boardId: input.boardId,
          columnId: input.columnId,
          organizationId: org.id,
          title: input.title,
          description: input.description,
          assigneeIds: dedupe(input.assigneeIds),
          reviewerIds: dedupe(input.reviewerIds),
          dueAt,
          priority: input.priority,
          estimate: input.estimate,
          subtasks: parseSubtasksInput(input.subtasks),
        });
        const event: KanbanCardCreatedEvent = {
          type: "kanban.card-created",
          boardId: input.boardId,
          columnId: input.columnId,
          cardId: card.id,
          organizationId: org.id,
          title: card.title,
          assigneeIds: card.assigneeIds,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
        // One card-assigned event per assignee (the subscriber skips self).
        for (const assigneeId of card.assigneeIds) {
          await emit(
            cardAssignedEvent({
              boardId: board.id,
              boardName: board.name,
              cardId: card.id,
              cardTitle: card.title,
              organizationId: org.id,
              assigneeId,
              assignedById: actorId,
            }),
          );
        }
        return card;
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          title: z.string().trim().min(1).max(200).optional(),
          // Rich-text (HTML) description ; the markup makes it much larger than
          // the equivalent plain text, so the cap is generous.
          description: z.string().max(20000).nullable().optional(),
          // Move the card to this column (the form's "status"). Ignored when it
          // matches the current column.
          columnId: z.string().min(1).optional(),
          assigneeIds: z.array(z.string().min(1)).max(20).optional(),
          reviewerIds: z.array(z.string().min(1)).max(20).optional(),
          dueAt: z.string().min(1).nullable().optional(),
          priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
          estimate: z.number().int().min(0).max(9999).nullable().optional(),
          subtasks: z.string().max(40000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "kanban.edit", org.id);
        const existing = await findCardById(input.id);
        if (!existing || existing.organizationId !== org.id) {
          throw new NotFoundError("KanbanCard", input.id);
        }
        const board = await requireAccessibleBoard(ctx.userId, org.id, existing.boardId);
        // A status change moves the card to another column of the same board.
        let movedToColumnId: string | undefined;
        if (input.columnId && input.columnId !== existing.columnId) {
          const target = await findColumnById(input.columnId);
          if (!target || target.boardId !== existing.boardId) {
            throw new NotFoundError("KanbanColumn", input.columnId);
          }
          movedToColumnId = input.columnId;
        }
        const dueAt = parseOptionalDate(input.dueAt);
        const nextAssignees = input.assigneeIds ? dedupe(input.assigneeIds) : undefined;
        const nextReviewers = input.reviewerIds ? dedupe(input.reviewerIds) : undefined;
        const changed: KanbanCardUpdatedEvent["changed"] = [];
        if (input.title !== undefined && input.title !== existing.title) changed.push("title");
        if (input.description !== undefined && input.description !== existing.description)
          changed.push("description");
        const assigneeChanged =
          nextAssignees !== undefined && !sameSet(existing.assigneeIds, nextAssignees);
        if (assigneeChanged) changed.push("assignee");
        const reviewerChanged =
          nextReviewers !== undefined && !sameSet(existing.reviewerIds, nextReviewers);
        if (reviewerChanged) changed.push("reviewer");
        if (input.dueAt !== undefined) changed.push("dueAt");
        if (input.priority !== undefined && (input.priority ?? null) !== existing.priority)
          changed.push("priority");
        if (input.estimate !== undefined && (input.estimate ?? null) !== existing.estimate)
          changed.push("estimate");
        const nextSubtasks = parseSubtasksInput(input.subtasks);
        if (
          nextSubtasks !== undefined &&
          JSON.stringify(nextSubtasks) !== JSON.stringify(parseSubtasks(existing.subtasks))
        )
          changed.push("subtasks");
        const card = await updateCard(input.id, {
          title: input.title,
          description: input.description,
          assigneeIds: nextAssignees,
          reviewerIds: nextReviewers,
          dueAt,
          priority: input.priority,
          estimate: input.estimate,
          subtasks: nextSubtasks,
          ...(movedToColumnId ? { columnId: movedToColumnId } : {}),
        });
        // A status change is a move — emit the same event a drag does.
        if (movedToColumnId) {
          const movedEvent: KanbanCardMovedEvent = {
            type: "kanban.card-moved",
            boardId: existing.boardId,
            cardId: card.id,
            organizationId: org.id,
            fromColumnId: existing.columnId,
            toColumnId: movedToColumnId,
            actorId,
            occurredAt: new Date(),
          };
          await emit(movedEvent);
        }
        if (changed.length > 0) {
          const event: KanbanCardUpdatedEvent = {
            type: "kanban.card-updated",
            boardId: existing.boardId,
            cardId: card.id,
            organizationId: org.id,
            changed,
            assigneeIds: card.assigneeIds,
            actorId,
            occurredAt: new Date(),
          };
          await emit(event);
        }
        // Notify only the NEWLY-added assignees (not those already on the card).
        if (assigneeChanged) {
          const added = card.assigneeIds.filter((id) => !existing.assigneeIds.includes(id));
          for (const assigneeId of added) {
            await emit(
              cardAssignedEvent({
                boardId: board.id,
                boardName: board.name,
                cardId: card.id,
                cardTitle: card.title,
                organizationId: org.id,
                assigneeId,
                assignedById: actorId,
              }),
            );
          }
        }
        return card;
      }),

    move: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          toColumnId: z.string().min(1),
          // Full ordered card-id list the target column should hold after the
          // move (including this card).
          orderedIdsInTarget: z.array(z.string().min(1)).min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "kanban.edit", org.id);
        const existing = await findCardById(input.id);
        if (!existing || existing.organizationId !== org.id) {
          throw new NotFoundError("KanbanCard", input.id);
        }
        await requireAccessibleBoard(ctx.userId, org.id, existing.boardId);
        const target = await findColumnById(input.toColumnId);
        if (!target || target.boardId !== existing.boardId) {
          throw new NotFoundError("KanbanColumn", input.toColumnId);
        }
        if (!input.orderedIdsInTarget.includes(input.id)) {
          throw new ValidationError("orderedIdsInTarget must include the moved card");
        }
        await moveCard(existing.boardId, input.toColumnId, input.orderedIdsInTarget);
        const event: KanbanCardMovedEvent = {
          type: "kanban.card-moved",
          boardId: existing.boardId,
          cardId: input.id,
          organizationId: org.id,
          fromColumnId: existing.columnId,
          toColumnId: input.toColumnId,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const actorId = await requirePermission(ctx, "kanban.delete", org.id);
        const existing = await findCardById(input.id);
        if (!existing || existing.organizationId !== org.id) {
          throw new NotFoundError("KanbanCard", input.id);
        }
        await requireAccessibleBoard(ctx.userId, org.id, existing.boardId);
        await softDeleteCard(input.id);
        const event: KanbanCardDeletedEvent = {
          type: "kanban.card-deleted",
          boardId: existing.boardId,
          cardId: input.id,
          organizationId: org.id,
          actorId,
          occurredAt: new Date(),
        };
        await emit(event);
      }),

    // Title search across every board the caller may see — powers the global
    // command palette's kanban results. Scoped to accessible boards (same
    // row-level rule as boards.list), so it never leaks a restricted board's
    // cards.
    search: publicProcedure
      .input(z.object({ query: z.string().min(2).max(200) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.view", org.id);
        const boardIds = await resolveAccessibleBoardIds(ctx.userId, org.id);
        return searchCards({ organizationId: org.id, boardIds, query: input.query });
      }),
  }),

  // ── Saved views ────────────────────────────────────────
  // Named MonarkQL queries per board (personal, or shared to everyone with
  // board access). Reading needs kanban.view + board access ; editing is scoped
  // to the view's owner. Mirrors data-models' dataModels.views.*.
  views: router({
    list: publicProcedure
      .input(z.object({ boardId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.view", org.id);
        await requireAccessibleBoard(ctx.userId, org.id, input.boardId);
        const views = await listKanbanViews(input.boardId, ctx.userId);
        return views.map((v) => serializeKanbanView(v, ctx.userId!));
      }),

    create: publicProcedure
      .input(
        z.object({
          boardId: z.string().min(1),
          name: z.string().trim().min(1).max(80),
          query: filterQuerySchema,
          shared: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        await requirePermission(ctx, "kanban.view", org.id);
        const board = await requireAccessibleBoard(ctx.userId, org.id, input.boardId);
        const view = await createKanbanView({
          boardId: input.boardId,
          organizationId: board.organizationId,
          name: input.name,
          query: input.query,
          shared: input.shared ?? false,
          createdBy: ctx.userId,
        });
        return serializeKanbanView(view, ctx.userId);
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(80).optional(),
          query: filterQuerySchema.optional(),
          shared: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const view = await requireOwnedKanbanView(input.id, ctx.userId);
        await requireAccessibleBoard(ctx.userId, org.id, view.boardId);
        const updated = await updateKanbanView(input.id, {
          name: input.name,
          query: input.query,
          shared: input.shared,
        });
        return serializeKanbanView(updated, ctx.userId);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const view = await requireOwnedKanbanView(input.id, ctx.userId);
        await requireAccessibleBoard(ctx.userId, org.id, view.boardId);
        await deleteKanbanView(input.id);
        return { id: input.id };
      }),
  }),
});

/** Drop duplicate ids, preserving first-seen order (`undefined` → `[]`). */
function dedupe(ids: string[] | undefined): string[] {
  return ids ? [...new Set(ids)] : [];
}

/** True when two id lists hold the same set (order-insensitive). */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

// Parse an optional ISO date string ; `null`/`undefined` pass through, an
// invalid string throws so a bad payload never silently drops the due date.
function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new ValidationError("Invalid date");
  return d;
}

// A saved view for the client : the `query` JSON surfaced as a typed FilterNode
// (keeps Prisma's recursive JsonValue out of the tRPC output type), plus a
// `mine` flag so the UI can gate rename/delete/share.
function serializeKanbanView(view: KanbanViewRow, userId: string) {
  return {
    id: view.id,
    boardId: view.boardId,
    name: view.name,
    query: view.query as unknown as FilterNode,
    shared: view.shared,
    mine: view.createdBy === userId,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

// Load a view and assert the caller owns it — a shared view is readable by all
// with board access, but only its creator may edit or delete it.
async function requireOwnedKanbanView(id: string, userId: string): Promise<KanbanViewRow> {
  const view = await findKanbanViewById(id);
  if (!view) throw new NotFoundError("KanbanView", id);
  if (view.createdBy !== userId) throw new ForbiddenError("You can only edit your own views.");
  return view;
}

export { registerKanbanPermissions } from "./permissions";
export { registerKanbanEventTypes } from "./event-types";
export { registerKanbanFeatureFlags } from "./flags";
export { registerKanbanNotificationKinds } from "./notification-kinds";
export {
  registerKanbanNotificationSubscriber,
  _resetKanbanNotificationSubscriberForTesting,
} from "./notification-subscriber";
export type { KanbanBoardRow, KanbanColumnRow, KanbanCardRow, OrgMember } from "./data";
