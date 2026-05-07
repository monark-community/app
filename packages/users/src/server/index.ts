import { z } from "zod"
import { router, publicProcedure } from "@monark/common/trpc"
import {
  emit,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@monark/common"
import { adminAssignmentSummary, getAllAssignments } from "@monark/rbac/server"
import type {
  UserDeletionCanceledEvent,
  UserDeletionRequestedEvent,
  UserEmailChangedEvent,
  UserProfileUpdatedEvent,
} from "../contracts/events"
import { getCurrent } from "./read"
import {
  findById,
  listUsersForAdmin,
  setDeletedAt,
  updateEmail,
  updateProfileData,
} from "./data"

// Centralised admin gate for the `users.admin*` procedures. Mirrors the
// rbac.isAdmin check the /admin route layout uses, so a non-admin can't
// reach the user-management surface even with a hand-crafted tRPC call.
async function requireAdmin(userId: string | null): Promise<string> {
  if (!userId) throw new UnauthorizedError()
  const summary = await adminAssignmentSummary(userId)
  if (!summary.hasAdmin) throw new ForbiddenError("Admin role required.")
  return userId
}

// Locales we accept; expanding here is cheap but intentional so we don't
// accept free-form locale strings that the web can't render.
const SUPPORTED_LOCALES = ["en", "fr"] as const

// 14-day grace window before the hard-delete cron anonymizes + removes the
// row (cron lands with ops scheduling; the primitive here is what matters).
const DELETION_GRACE_DAYS = 14

const updateProfileInput = z.object({
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  // Bio: free-form, max 400 code points (Array.from-counted ; emoji
  // count once each). Blank string clears, mapped to null below so the
  // DB column stays clean.
  bio: z
    .string()
    .max(400)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined
      if (value === null) return null
      const trimmed = value.trim()
      return trimmed.length === 0 ? null : trimmed
    }),
  localePreference: z.enum(SUPPORTED_LOCALES).optional(),
})

export const usersRouter = router({
  me: publicProcedure.query(({ ctx }) => getCurrent({ userId: ctx.userId })),

  // Partial update. Only fields present in the input are touched; pass
  // `displayName: null` / `avatarUrl: null` explicitly to clear a field.
  updateProfile: publicProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const user = await updateProfileData(ctx.userId, input)
      const changed: UserProfileUpdatedEvent["changed"] = []
      if (input.displayName !== undefined) changed.push("displayName")
      if (input.avatarUrl !== undefined) changed.push("avatarUrl")
      if (input.bannerUrl !== undefined) changed.push("bannerUrl")
      if (input.bio !== undefined) changed.push("bio")
      if (input.localePreference !== undefined) changed.push("localePreference")
      if (changed.length > 0) {
        const event: UserProfileUpdatedEvent = {
          type: "user.profile-updated",
          userId: ctx.userId,
          changed,
          occurredAt: new Date(),
        }
        await emit(event)
      }
      return user
    }),

  // Mirrors Supabase's email change into our shadow `User.email` row and
  // emits `user.email-changed`. Called from the /auth/confirm route after a
  // successful Supabase verifyOtp(type="email_change"); the caller is
  // trusted because it runs server-side after Supabase has already rotated
  // `auth.users.email`.
  syncEmail: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError()
      const existing = await findById(ctx.userId)
      if (!existing) throw new NotFoundError("User", ctx.userId)
      if (existing.email === input.email) return existing
      const updated = await updateEmail(ctx.userId, input.email)
      const event: UserEmailChangedEvent = {
        type: "user.email-changed",
        userId: updated.id,
        previousEmail: existing.email,
        newEmail: updated.email,
        occurredAt: new Date(),
      }
      await emit(event)
      return updated
    }),

  // Stamps `deletedAt = now`. The 14-day grace window starts immediately;
  // hard-delete (anonymization + Supabase admin delete) runs after that
  // window via a cron that isn't wired yet. Callers sign out right after.
  requestAccountDeletion: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    const existing = await findById(ctx.userId)
    if (!existing) throw new NotFoundError("User", ctx.userId)
    if (existing.deletedAt) {
      // Idempotent: don't re-stamp if already in grace.
      const completesAt = new Date(
        existing.deletedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
      )
      return { deletionCompletesAt: completesAt }
    }
    const now = new Date()
    await setDeletedAt(ctx.userId, now)
    const completesAt = new Date(
      now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    )
    const event: UserDeletionRequestedEvent = {
      type: "user.deletion-requested",
      userId: ctx.userId,
      deletionCompletesAt: completesAt,
      occurredAt: now,
    }
    await emit(event)
    return { deletionCompletesAt: completesAt }
  }),

  // Reverses `requestAccountDeletion` during the grace window.
  cancelAccountDeletion: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError()
    const existing = await findById(ctx.userId)
    if (!existing) throw new NotFoundError("User", ctx.userId)
    if (!existing.deletedAt) {
      throw new ValidationError("No deletion is pending.")
    }
    await setDeletedAt(ctx.userId, null)
    const event: UserDeletionCanceledEvent = {
      type: "user.deletion-canceled",
      userId: ctx.userId,
      occurredAt: new Date(),
    }
    await emit(event)
  }),

  // Cursor-paginated user list for the admin /admin/users surface.
  // `search` matches email or displayName case-insensitively. Already-
  // anonymized rows are filtered out by the data layer ; pending-deletion
  // rows stay visible because admins may want to cancel or hard-delete.
  // Filters layer on top : roles (any active assignment), statuses
  // (active / disabled / pending-deletion), email-verified tri-state,
  // and a "joined within the last N days" preset surfaced as a date.
  adminListUsers: publicProcedure
    .input(
      z.object({
        search: z.string().trim().max(120).optional(),
        cursor: z.string().optional(),
        // 25 is plenty for a single screen ; cap at 100 so a hostile
        // caller can't fan a single query into a megabyte response.
        limit: z.number().int().min(1).max(100).optional().default(25),
        // FK ids into the Role table — list only users with at least
        // one active assignment to any of these.
        roleIds: z.array(z.string().min(1)).optional(),
        statuses: z
          .array(z.enum(["active", "disabled", "pending-deletion"]))
          .optional(),
        emailVerified: z.boolean().optional(),
        // ISO datetime surfaced from the UI's "joined within …" preset.
        // Validated as parseable so a typo doesn't silently filter to
        // "everything since 1970".
        joinedAfter: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId)
      return listUsersForAdmin({
        search: input.search,
        cursor: input.cursor,
        limit: input.limit,
        roleIds: input.roleIds,
        statuses: input.statuses,
        emailVerified: input.emailVerified,
        joinedAfter: input.joinedAfter ? new Date(input.joinedAfter) : undefined,
      })
    }),

  // Detailed view for a single user. Bundles roles in the same response
  // so the detail page can render the role table without an extra
  // round-trip. Bounces with NotFoundError if the row was already
  // anonymized + hard-deleted ; admins should only land on this page
  // through the list, which already filters those out.
  adminGetUser: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId)
      const user = await findById(input.userId)
      if (!user) throw new NotFoundError("User", input.userId)
      const assignments = await getAllAssignments(input.userId)
      return { user, assignments }
    }),

  // Admin variant of `updateProfile`. Same input shape but takes an
  // explicit `userId` target. Re-uses the self-service event so any
  // listener (notification fan-out, audit log) stays vendor-neutral on
  // who triggered the change ; we don't yet carry an `actorId` on the
  // event, but the rbac gate above guarantees the actor is an admin.
  adminUpdateProfile: publicProcedure
    .input(
      updateProfileInput.extend({
        userId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId)
      const { userId, ...patch } = input
      const target = await findById(userId)
      if (!target) throw new NotFoundError("User", userId)
      const user = await updateProfileData(userId, patch)
      const changed: UserProfileUpdatedEvent["changed"] = []
      if (patch.displayName !== undefined) changed.push("displayName")
      if (patch.avatarUrl !== undefined) changed.push("avatarUrl")
      if (patch.bannerUrl !== undefined) changed.push("bannerUrl")
      if (patch.bio !== undefined) changed.push("bio")
      if (patch.localePreference !== undefined) changed.push("localePreference")
      if (changed.length > 0) {
        const event: UserProfileUpdatedEvent = {
          type: "user.profile-updated",
          userId,
          changed,
          occurredAt: new Date(),
        }
        await emit(event)
      }
      return user
    }),

  // Admin variant of the standard 14-day grace-period deletion. Mirrors
  // `requestAccountDeletion` but takes an explicit target userId. The hard
  // delete (anonymization + Supabase admin delete) lives in the auth
  // package since it owns Supabase admin access ; see
  // `auth.adminHardDeleteUser`.
  adminRequestDeletion: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actorId = await requireAdmin(ctx.userId)
      // No self-targeting via this surface ; if an admin wants to delete
      // their own account they go through the standard /account flow
      // (which uses the same procedure, but signs them out + redirects
      // appropriately afterwards). Avoiding it here keeps the admin
      // detail page from accidentally signing out the operator.
      if (input.userId === actorId) {
        throw new ValidationError("Use your own account page to request your deletion.")
      }
      const existing = await findById(input.userId)
      if (!existing) throw new NotFoundError("User", input.userId)
      if (existing.deletedAt) {
        const completesAt = new Date(
          existing.deletedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
        )
        return { deletionCompletesAt: completesAt }
      }
      const now = new Date()
      await setDeletedAt(input.userId, now)
      const completesAt = new Date(
        now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
      )
      const event: UserDeletionRequestedEvent = {
        type: "user.deletion-requested",
        userId: input.userId,
        deletionCompletesAt: completesAt,
        occurredAt: now,
      }
      await emit(event)
      return { deletionCompletesAt: completesAt }
    }),

  // Admin cancels a pending deletion grace-window. Same effect as the
  // user's own `cancelAccountDeletion` ; useful when support resolves a
  // false-positive deletion request.
  adminCancelDeletion: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId)
      const existing = await findById(input.userId)
      if (!existing) throw new NotFoundError("User", input.userId)
      if (!existing.deletedAt) {
        throw new ValidationError("No deletion is pending for this user.")
      }
      await setDeletedAt(input.userId, null)
      const event: UserDeletionCanceledEvent = {
        type: "user.deletion-canceled",
        userId: input.userId,
        occurredAt: new Date(),
      }
      await emit(event)
    }),
})

export { getById, getByIdOrThrow, getByEmail, getCurrent, type User } from "./read"
