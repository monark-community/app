import { z } from "zod";
import { router, publicProcedure } from "@monark/common/trpc";
import {
  emit,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@monark/common";
import { getDb } from "@monark/db";

// Trust window options surfaced in the /account/security UI. Kept
// inline here (rather than importing from @monark/auth) because
// @monark/auth depends on @monark/users — pulling the constant
// across that boundary would create a cycle. The same list is
// asserted on the auth side (`DEVICE_TTL_OPTIONS_DAYS`) ; drift
// between the two would surface as a Zod rejection on the mutation
// and is covered by integration tests.
const TRUSTED_DEVICE_TTL_DAYS_OPTIONS = [30, 60, 90] as const;
import { adminAssignmentSummary, getAllAssignments, requirePermission } from "@monark/rbac/server";
import type {
  UserDeletionCanceledEvent,
  UserDeletionRequestedEvent,
  UserEmailChangedEvent,
  UserProfileUpdatedEvent,
} from "../contracts/events";
import { getCurrent } from "./read";
import { findById, listUsersForAdmin, setDeletedAt, updateEmail, updateProfileData } from "./data";
import {
  deleteUserMetadataValue,
  getUserMetadataValue,
  listUserMetadataForModule,
  setUserMetadataValue,
} from "./metadata";

// Centralised admin gate for the `users.admin*` procedures. Mirrors the
// rbac.isAdmin check the /admin route layout uses, so a non-admin can't
// reach the user-management surface even with a hand-crafted tRPC call.
async function requireAdmin(userId: string | null): Promise<string> {
  if (!userId) throw new UnauthorizedError();
  const summary = await adminAssignmentSummary(userId);
  if (!summary.hasAdmin) throw new ForbiddenError("Admin role required.");
  return userId;
}

// Locales we accept; expanding here is cheap but intentional so we don't
// accept free-form locale strings that the web can't render.
const SUPPORTED_LOCALES = ["en", "fr"] as const;

// 14-day grace window before the hard-delete cron anonymizes + removes the
// row (cron lands with ops scheduling; the primitive here is what matters).
const DELETION_GRACE_DAYS = 14;

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
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
  localePreference: z.enum(SUPPORTED_LOCALES).optional(),
});

export const usersRouter = router({
  me: publicProcedure.query(({ ctx }) => getCurrent({ userId: ctx.userId })),

  // Partial update. Only fields present in the input are touched; pass
  // `displayName: null` / `avatarUrl: null` explicitly to clear a field.
  updateProfile: publicProcedure.input(updateProfileInput).mutation(async ({ ctx, input }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const user = await updateProfileData(ctx.userId, input);
    const changed: UserProfileUpdatedEvent["changed"] = [];
    if (input.displayName !== undefined) changed.push("displayName");
    if (input.avatarUrl !== undefined) changed.push("avatarUrl");
    if (input.bannerUrl !== undefined) changed.push("bannerUrl");
    if (input.bio !== undefined) changed.push("bio");
    if (input.localePreference !== undefined) changed.push("localePreference");
    if (changed.length > 0) {
      const event: UserProfileUpdatedEvent = {
        type: "user.profile-updated",
        userId: ctx.userId,
        changed,
        occurredAt: new Date(),
      };
      await emit(event);
    }
    return user;
  }),

  // User-configurable trust window for the device-recognition cookie /
  // TrustedDevice row. Picking a shorter value (e.g. 30) means the
  // user will re-do the new-device flow (email + TOTP if enabled) more
  // often ; the 400-day default matches what the cookie's RFC 6265bis
  // ceiling allows. On change, slide every active row's `expiresAt`
  // forward by the new TTL from `lastSeenAt` so the choice takes
  // effect immediately for already-trusted devices instead of waiting
  // until the next recognised sign-in to roll over.
  //
  // No domain event emitted ; this is a personal preference, not an
  // audit-worthy change. (TrustedDevice add / revoke events still fire
  // on subsequent recognitions / explicit revokes.)
  updateTrustedDeviceTtl: publicProcedure
    .input(
      z.object({
        days: z
          .number()
          .int()
          .refine(
            (value): value is (typeof TRUSTED_DEVICE_TTL_DAYS_OPTIONS)[number] =>
              (TRUSTED_DEVICE_TTL_DAYS_OPTIONS as readonly number[]).includes(value),
            "Unsupported trust window.",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const db = getDb();
      await db.user.update({
        where: { id: ctx.userId },
        data: { trustedDeviceTtlDays: input.days },
      });
      // Retroactive recompute : raw SQL because Prisma can't express
      // `expiresAt = lastSeenAt + INTERVAL` in a single update call.
      // Only touches still-active rows (revoked rows are audit-only ;
      // expired rows are already past their cutoff and the sweep will
      // collect them). Caps to 400 days defensively in case a future
      // option exceeds the browser cookie ceiling.
      const days = Math.min(input.days, 400);
      await db.$executeRaw`
        UPDATE "TrustedDevice"
        SET "expiresAt" = "lastSeenAt" + (${days} * INTERVAL '1 day')
        WHERE "userId" = ${ctx.userId} AND "revokedAt" IS NULL
      `;
      return { days: input.days };
    }),

  // Mirrors Supabase's email change into our shadow `User.email` row and
  // emits `user.email-changed`. Called from the /auth/confirm route after a
  // successful Supabase verifyOtp(type="email_change"); the caller is
  // trusted because it runs server-side after Supabase has already rotated
  // `auth.users.email`.
  syncEmail: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) throw new UnauthorizedError();
      const existing = await findById(ctx.userId);
      if (!existing) throw new NotFoundError("User", ctx.userId);
      if (existing.email === input.email) return existing;
      const updated = await updateEmail(ctx.userId, input.email);
      const event: UserEmailChangedEvent = {
        type: "user.email-changed",
        userId: updated.id,
        previousEmail: existing.email,
        newEmail: updated.email,
        occurredAt: new Date(),
      };
      await emit(event);
      return updated;
    }),

  // Stamps `deletedAt = now`. The 14-day grace window starts immediately;
  // hard-delete (anonymization + Supabase admin delete) runs after that
  // window via a cron that isn't wired yet. Callers sign out right after.
  requestAccountDeletion: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const existing = await findById(ctx.userId);
    if (!existing) throw new NotFoundError("User", ctx.userId);
    if (existing.deletedAt) {
      // Idempotent: don't re-stamp if already in grace.
      const completesAt = new Date(
        existing.deletedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
      );
      return { deletionCompletesAt: completesAt };
    }
    const now = new Date();
    await setDeletedAt(ctx.userId, now);
    const completesAt = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const event: UserDeletionRequestedEvent = {
      type: "user.deletion-requested",
      userId: ctx.userId,
      deletionCompletesAt: completesAt,
      occurredAt: now,
    };
    await emit(event);
    return { deletionCompletesAt: completesAt };
  }),

  // Reverses `requestAccountDeletion` during the grace window.
  cancelAccountDeletion: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const existing = await findById(ctx.userId);
    if (!existing) throw new NotFoundError("User", ctx.userId);
    if (!existing.deletedAt) {
      throw new ValidationError("No deletion is pending.");
    }
    await setDeletedAt(ctx.userId, null);
    const event: UserDeletionCanceledEvent = {
      type: "user.deletion-canceled",
      userId: ctx.userId,
      occurredAt: new Date(),
    };
    await emit(event);
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
        statuses: z.array(z.enum(["active", "disabled", "pending-deletion"])).optional(),
        emailVerified: z.boolean().optional(),
        // ISO datetime surfaced from the UI's "joined within …" preset.
        // Validated as parseable so a typo doesn't silently filter to
        // "everything since 1970".
        joinedAfter: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      return listUsersForAdmin({
        search: input.search,
        cursor: input.cursor,
        limit: input.limit,
        roleIds: input.roleIds,
        statuses: input.statuses,
        emailVerified: input.emailVerified,
        joinedAfter: input.joinedAfter ? new Date(input.joinedAfter) : undefined,
      });
    }),

  // Detailed view for a single user. Bundles roles in the same response
  // so the detail page can render the role table without an extra
  // round-trip. Bounces with NotFoundError if the row was already
  // anonymized + hard-deleted ; admins should only land on this page
  // through the list, which already filters those out.
  adminGetUser: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      const user = await findById(input.userId);
      if (!user) throw new NotFoundError("User", input.userId);
      const assignments = await getAllAssignments(input.userId);
      return { user, assignments };
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
      await requireAdmin(ctx.userId);
      const { userId, ...patch } = input;
      const target = await findById(userId);
      if (!target) throw new NotFoundError("User", userId);
      const user = await updateProfileData(userId, patch);
      const changed: UserProfileUpdatedEvent["changed"] = [];
      if (patch.displayName !== undefined) changed.push("displayName");
      if (patch.avatarUrl !== undefined) changed.push("avatarUrl");
      if (patch.bannerUrl !== undefined) changed.push("bannerUrl");
      if (patch.bio !== undefined) changed.push("bio");
      if (patch.localePreference !== undefined) changed.push("localePreference");
      if (changed.length > 0) {
        const event: UserProfileUpdatedEvent = {
          type: "user.profile-updated",
          userId,
          changed,
          occurredAt: new Date(),
        };
        await emit(event);
      }
      return user;
    }),

  // Admin variant of the standard 14-day grace-period deletion. Mirrors
  // `requestAccountDeletion` but takes an explicit target userId. The hard
  // delete (anonymization + Supabase admin delete) lives in the auth
  // package since it owns Supabase admin access ; see
  // `auth.adminHardDeleteUser`.
  adminRequestDeletion: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actorId = await requireAdmin(ctx.userId);
      // No self-targeting via this surface ; if an admin wants to delete
      // their own account they go through the standard /account flow
      // (which uses the same procedure, but signs them out + redirects
      // appropriately afterwards). Avoiding it here keeps the admin
      // detail page from accidentally signing out the operator.
      if (input.userId === actorId) {
        throw new ValidationError("Use your own account page to request your deletion.");
      }
      const existing = await findById(input.userId);
      if (!existing) throw new NotFoundError("User", input.userId);
      if (existing.deletedAt) {
        const completesAt = new Date(
          existing.deletedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
        );
        return { deletionCompletesAt: completesAt };
      }
      const now = new Date();
      await setDeletedAt(input.userId, now);
      const completesAt = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
      const event: UserDeletionRequestedEvent = {
        type: "user.deletion-requested",
        userId: input.userId,
        deletionCompletesAt: completesAt,
        occurredAt: now,
      };
      await emit(event);
      return { deletionCompletesAt: completesAt };
    }),

  // Admin cancels a pending deletion grace-window. Same effect as the
  // user's own `cancelAccountDeletion` ; useful when support resolves a
  // false-positive deletion request.
  adminCancelDeletion: publicProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx.userId);
      const existing = await findById(input.userId);
      if (!existing) throw new NotFoundError("User", input.userId);
      if (!existing.deletedAt) {
        throw new ValidationError("No deletion is pending for this user.");
      }
      await setDeletedAt(input.userId, null);
      const event: UserDeletionCanceledEvent = {
        type: "user.deletion-canceled",
        userId: input.userId,
        occurredAt: new Date(),
      };
      await emit(event);
    }),

  // ── Generic metadata sidecar ────────────────────────────────────
  // Read / write per-user JSON cells scoped to a specific module.
  // Authorization is module-aware : the caller needs the
  // `users.read-metadata-for-module-<module>` permission for reads
  // (or to be the user themselves) ; writes need
  // `users.write-metadata-for-module-<module>`. Each owning module
  // registers those permissions at boot via
  // `registerPermissions("users", { ... })` so non-core extensions
  // can opt-in to operating on user metadata without modifying core.
  metadata: router({
    list: publicProcedure
      .input(
        z.object({
          userId: z.string().min(1),
          module: z.string().min(1),
        }),
      )
      .query(async ({ ctx, input }) => {
        const isSelf = ctx.userId === input.userId;
        if (!isSelf) {
          await requirePermission(ctx, `users.read-metadata-for-module-${input.module}`);
        }
        return listUserMetadataForModule(input.userId, input.module);
      }),

    get: publicProcedure
      .input(
        z.object({
          userId: z.string().min(1),
          module: z.string().min(1),
          key: z.string().min(1),
        }),
      )
      .query(async ({ ctx, input }) => {
        const isSelf = ctx.userId === input.userId;
        if (!isSelf) {
          await requirePermission(ctx, `users.read-metadata-for-module-${input.module}`);
        }
        return getUserMetadataValue(input.userId, input.module, input.key);
      }),

    set: publicProcedure
      .input(
        z.object({
          userId: z.string().min(1),
          module: z.string().min(1),
          key: z.string().min(1),
          // `unknown` accepts arbitrary JSON ; the data layer stores
          // it verbatim. Modules validate their own value shape on
          // the way in.
          value: z.unknown(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requirePermission(ctx, `users.write-metadata-for-module-${input.module}`);
        return setUserMetadataValue({
          userId: input.userId,
          module: input.module,
          key: input.key,
          value: input.value,
        });
      }),

    delete: publicProcedure
      .input(
        z.object({
          userId: z.string().min(1),
          module: z.string().min(1),
          key: z.string().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await requirePermission(ctx, `users.write-metadata-for-module-${input.module}`);
        await deleteUserMetadataValue(input.userId, input.module, input.key);
      }),
  }),
});

export { getById, getByIdOrThrow, getByEmail, getCurrent, type User } from "./read";
export { registerUsersPermissions } from "./permissions";
export { registerUsersEventTypes } from "./event-types";
export {
  listUserMetadataForModule,
  getUserMetadataValue,
  setUserMetadataValue,
  deleteUserMetadataValue,
  deleteUserMetadataForModule,
  type UserMetadataRow,
} from "./metadata";
