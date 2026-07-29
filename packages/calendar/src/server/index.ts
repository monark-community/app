// Side-effect import: activates the declare module "@monark/notifications/contracts"
// augmentation in contracts/types.ts, making "calendar.event.reminder" part of
// NotificationKind for any compilation that imports @monark/calendar/server.
import "../contracts/types";
import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import { emit, NotFoundError, UnauthorizedError, ValidationError } from "@monark/common";
import { requireOrg } from "@monark/organizations/server";
import { getUserRoles, hasPermission } from "@monark/rbac/server";
import type {
  CalendarCreatedEvent,
  CalendarDeletedEvent,
  CalendarEventCreatedEvent,
  CalendarEventDeletedEvent,
  CalendarEventUpdatedEvent,
  CalendarUpdatedEvent,
} from "../contracts/events";
import {
  createCalendar,
  createCalendarEvent,
  ensurePersonalCalendar,
  findCalendarById,
  findCalendarEventById,
  listAccessibleCalendars,
  listCalendarMembers,
  listEventsForDay,
  restoreCalendar,
  searchCalendarEvents,
  setCalendarRoleAccess,
  softDeleteCalendar,
  softDeleteCalendarEvent,
  updateCalendar,
  updateCalendarEvent,
} from "./data";

async function resolveRoleIds(userId: string, orgId: string): Promise<string[]> {
  const roles = await getUserRoles(userId, orgId);
  return roles.map((r) => r.id);
}

async function resolveAccessibleCalendarIds(userId: string, orgId: string): Promise<string[]> {
  const [roleIds, canManage] = await Promise.all([
    resolveRoleIds(userId, orgId),
    hasPermission(userId, "calendar.manage", orgId),
  ]);
  const calendars = await listAccessibleCalendars({
    organizationId: orgId,
    roleIds,
    hasManagedPermission: canManage,
  });
  return calendars.map((c) => c.id);
}

export const calendarRouter = router({
  // ── Calendars ──────────────────────────────────────────
  calendars: router({
    list: publicProcedure
      .input(z.object({ includeDeleted: z.boolean().optional() }).optional())
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const [roleIds, canManage] = await Promise.all([
          resolveRoleIds(ctx.userId, org.id),
          hasPermission(ctx.userId, "calendar.manage", org.id),
        ]);
        return listAccessibleCalendars({
          organizationId: org.id,
          roleIds,
          hasManagedPermission: canManage,
          // Archived calendars are only surfaced when explicitly requested
          // (the sidebar's "show archived" toggle) ; and only to managers,
          // since a role-scoped user has no restore affordance.
          includeDeleted: Boolean(input?.includeDeleted) && canManage,
        });
      }),

    ensurePersonal: publicProcedure.mutation(async ({ ctx }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const org = await requireOrg({
        userId: ctx.userId,
        activeOrganizationId: ctx.activeOrganizationId,
      });
      return ensurePersonalCalendar({ organizationId: org.id });
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
        const [canCreate, canManage] = await Promise.all([
          hasPermission(ctx.userId, "calendar.create", org.id),
          hasPermission(ctx.userId, "calendar.manage", org.id),
        ]);
        if (!canCreate && !canManage) throw new UnauthorizedError();
        const calendar = await createCalendar({
          organizationId: org.id,
          name: input.name,
          description: input.description,
          color: input.color,
        });
        if (input.roleIds && input.roleIds.length > 0) {
          await setCalendarRoleAccess(calendar.id, input.roleIds);
        }
        await emit<CalendarCreatedEvent>({
          type: "calendar.created",
          calendarId: calendar.id,
          organizationId: org.id,
          name: calendar.name,
          actorId: ctx.userId,
          occurredAt: new Date(),
        }).catch(() => {});
        return findCalendarById(calendar.id);
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
        // Any user who can access a calendar may edit its basic fields
        // (name, description, color). Changing role access requires calendar.manage.
        const [accessibleIds, canManage] = await Promise.all([
          resolveAccessibleCalendarIds(ctx.userId, org.id),
          hasPermission(ctx.userId, "calendar.manage", org.id),
        ]);
        const existing = await findCalendarById(input.id);
        if (!existing || existing.organizationId !== org.id || !accessibleIds.includes(input.id)) {
          throw new NotFoundError("Calendar", input.id);
        }
        const updated = await updateCalendar(input.id, {
          name: input.name,
          description: input.description,
          color: input.color,
        });
        const changed: CalendarUpdatedEvent["changed"] = [];
        if (input.name !== undefined) changed.push("name");
        if (input.description !== undefined) changed.push("description");
        if (input.color !== undefined) changed.push("color");
        if (input.roleIds !== undefined && canManage) {
          await setCalendarRoleAccess(input.id, input.roleIds);
          changed.push("roleAccess");
        }
        await emit<CalendarUpdatedEvent>({
          type: "calendar.updated",
          calendarId: input.id,
          organizationId: org.id,
          changed,
          actorId: ctx.userId,
          occurredAt: new Date(),
        }).catch(() => {});
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
        const [canDelete, canManage] = await Promise.all([
          hasPermission(ctx.userId, "calendar.delete", org.id),
          hasPermission(ctx.userId, "calendar.manage", org.id),
        ]);
        if (!canDelete && !canManage) throw new UnauthorizedError();
        const existing = await findCalendarById(input.id);
        if (!existing || existing.organizationId !== org.id) {
          throw new NotFoundError("Calendar", input.id);
        }
        if (existing.isPersonal) {
          throw new ValidationError("The personal calendar cannot be deleted.");
        }
        await softDeleteCalendar(input.id);
        await emit<CalendarDeletedEvent>({
          type: "calendar.deleted",
          calendarId: input.id,
          organizationId: org.id,
          actorId: ctx.userId,
          occurredAt: new Date(),
        }).catch(() => {});
      }),

    restore: publicProcedure
      .input(z.object({ id: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const [canDelete, canManage] = await Promise.all([
          hasPermission(ctx.userId, "calendar.delete", org.id),
          hasPermission(ctx.userId, "calendar.manage", org.id),
        ]);
        if (!canDelete && !canManage) throw new UnauthorizedError();
        const existing = await findCalendarById(input.id, {
          includeDeleted: true,
        });
        if (!existing || existing.organizationId !== org.id) {
          throw new NotFoundError("Calendar", input.id);
        }
        await restoreCalendar(input.id);
      }),

    members: publicProcedure
      .input(z.object({ calendarId: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const calendarIds = await resolveAccessibleCalendarIds(ctx.userId, org.id);
        if (!calendarIds.includes(input.calendarId)) {
          throw new NotFoundError("Calendar", input.calendarId);
        }
        return listCalendarMembers({ organizationId: org.id, calendarId: input.calendarId });
      }),
  }),

  // ── Events ─────────────────────────────────────────────
  events: router({
    listForDay: publicProcedure
      .input(z.object({ startAt: z.string().min(1), endAt: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const calendarIds = await resolveAccessibleCalendarIds(ctx.userId, org.id);
        if (calendarIds.length === 0) return [];
        const startAt = new Date(input.startAt);
        const endAt = new Date(input.endAt);
        if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()))
          throw new ValidationError("Invalid date range");
        return listEventsForDay({ organizationId: org.id, calendarIds, startAt, endAt });
      }),

    create: publicProcedure
      .input(
        z.object({
          calendarId: z.string().min(1),
          eventType: z.enum(["STANDARD", "PUNCTUAL", "ALL_DAY"]).default("STANDARD"),
          title: z.string().trim().min(1).max(200),
          description: z.string().max(2000).nullable().optional(),
          location: z.string().max(200).nullable().optional(),
          participants: z.array(z.string().trim().min(1)).optional(),
          startAt: z.string().min(1),
          endAt: z.string().min(1),
          reminders: z.array(z.number().int().min(0)).max(10).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const calendarIds = await resolveAccessibleCalendarIds(ctx.userId, org.id);
        if (!calendarIds.includes(input.calendarId)) {
          throw new NotFoundError("Calendar", input.calendarId);
        }
        const startAt = new Date(input.startAt);
        const endAt = new Date(input.endAt);
        if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
          throw new ValidationError("Invalid date");
        }
        if (input.eventType !== "PUNCTUAL" && endAt < startAt) {
          throw new ValidationError("End time cannot be before start time");
        }
        const event = await createCalendarEvent({
          calendarId: input.calendarId,
          organizationId: org.id,
          title: input.title,
          description: input.description,
          location: input.location,
          participants: input.participants,
          startAt,
          endAt,
          eventType: input.eventType,
          reminderMinutes: input.reminders,
        });
        await emit<CalendarEventCreatedEvent>({
          type: "calendar.event-created",
          eventId: event.id,
          calendarId: input.calendarId,
          organizationId: org.id,
          title: input.title,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          actorId: ctx.userId,
          occurredAt: new Date(),
        }).catch(() => {});
        return event;
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.string().min(1),
          calendarId: z.string().min(1).optional(),
          eventType: z.enum(["STANDARD", "PUNCTUAL", "ALL_DAY"]).optional(),
          title: z.string().trim().min(1).max(200).optional(),
          description: z.string().max(2000).nullable().optional(),
          location: z.string().max(200).nullable().optional(),
          participants: z.array(z.string().trim().min(1)).optional(),
          startAt: z.string().min(1).optional(),
          endAt: z.string().min(1).optional(),
          reminders: z.array(z.number().int().min(0)).max(10).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        // Authorize against the event's own calendar : the caller must have
        // access to the calendar the event currently lives in (same model as
        // `create`, which gates on calendar accessibility). Without this an
        // authenticated user could edit or relocate any event by id.
        const calendarIds = await resolveAccessibleCalendarIds(ctx.userId, org.id);
        const existing = await findCalendarEventById(input.id);
        if (
          !existing ||
          existing.organizationId !== org.id ||
          !calendarIds.includes(existing.calendarId)
        ) {
          throw new NotFoundError("CalendarEvent", input.id);
        }
        // A move to a different calendar requires access to the target too.
        if (input.calendarId !== undefined && !calendarIds.includes(input.calendarId)) {
          throw new NotFoundError("Calendar", input.calendarId);
        }
        const startAt = input.startAt ? new Date(input.startAt) : undefined;
        const endAt = input.endAt ? new Date(input.endAt) : undefined;
        if (startAt && isNaN(startAt.getTime())) throw new ValidationError("Invalid startAt");
        if (endAt && isNaN(endAt.getTime())) throw new ValidationError("Invalid endAt");
        const updated = await updateCalendarEvent(input.id, {
          calendarId: input.calendarId,
          eventType: input.eventType,
          title: input.title,
          description: input.description,
          location: input.location,
          participants: input.participants,
          startAt,
          endAt,
          reminderMinutes: input.reminders,
        });
        const changed: CalendarEventUpdatedEvent["changed"] = [];
        if (input.title !== undefined) changed.push("title");
        if (input.description !== undefined) changed.push("description");
        if (input.location !== undefined) changed.push("location");
        if (input.participants !== undefined) changed.push("participants");
        if (input.startAt !== undefined) changed.push("startAt");
        if (input.endAt !== undefined) changed.push("endAt");
        if (input.reminders !== undefined) changed.push("reminders");
        if (input.eventType !== undefined) changed.push("eventType");
        if (input.calendarId !== undefined && input.calendarId !== existing.calendarId) {
          changed.push("calendar");
        }
        await emit<CalendarEventUpdatedEvent>({
          type: "calendar.event-updated",
          eventId: input.id,
          calendarId: input.calendarId ?? existing.calendarId,
          organizationId: org.id,
          changed,
          actorId: ctx.userId,
          occurredAt: new Date(),
        }).catch(() => {});
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
        // Same authorization as `update` : the event must belong to the
        // caller's org and to a calendar they can access. Without this any
        // authenticated user could soft-delete any event platform-wide by id.
        const calendarIds = await resolveAccessibleCalendarIds(ctx.userId, org.id);
        const existing = await findCalendarEventById(input.id);
        if (
          !existing ||
          existing.organizationId !== org.id ||
          !calendarIds.includes(existing.calendarId)
        ) {
          throw new NotFoundError("CalendarEvent", input.id);
        }
        await softDeleteCalendarEvent(input.id);
        await emit<CalendarEventDeletedEvent>({
          type: "calendar.event-deleted",
          eventId: input.id,
          calendarId: existing.calendarId,
          organizationId: org.id,
          actorId: ctx.userId,
          occurredAt: new Date(),
        }).catch(() => {});
      }),

    search: publicProcedure
      .input(z.object({ query: z.string().min(2).max(200) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.userId) throw new UnauthorizedError();
        const org = await requireOrg({
          userId: ctx.userId,
          activeOrganizationId: ctx.activeOrganizationId,
        });
        const calendarIds = await resolveAccessibleCalendarIds(ctx.userId, org.id);
        if (calendarIds.length === 0) return [];
        return searchCalendarEvents({ organizationId: org.id, calendarIds, query: input.query });
      }),
  }),
});

export { registerCalendarPermissions } from "./permissions";
export { registerCalendarEventTypes } from "./event-types";
export { registerCalendarNotificationKinds } from "./notification-kinds";
export { registerCalendarModelIntegration } from "./model-integration";
export {
  registerCalendarDataModelSubscriber,
  _resetCalendarDataModelSubscriberForTesting,
} from "./data-model-subscriber";
export { getPendingReminders, markReminderNotified, listCalendarMembers } from "./data";
export type { CalendarRow, CalendarEventRow, PendingReminderRow } from "./data";
