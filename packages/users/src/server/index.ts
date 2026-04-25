import { z } from "zod"
import { router, publicProcedure } from "@monark/common/trpc"
import { emit, NotFoundError, UnauthorizedError, ValidationError } from "@monark/common"
import type {
  UserDeletionCanceledEvent,
  UserDeletionRequestedEvent,
  UserEmailChangedEvent,
  UserProfileUpdatedEvent,
} from "../contracts/events"
import { getCurrent } from "./read"
import { findById, setDeletedAt, updateEmail, updateProfileData } from "./data"

// Locales we accept; expanding here is cheap but intentional so we don't
// accept free-form locale strings that the web can't render.
const SUPPORTED_LOCALES = ["en", "fr"] as const

// 14-day grace window before the hard-delete cron anonymizes + removes the
// row (cron lands with ops scheduling; the primitive here is what matters).
const DELETION_GRACE_DAYS = 14

const updateProfileInput = z.object({
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
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
})

export { getById, getByIdOrThrow, getByEmail, getCurrent, type User } from "./read"
