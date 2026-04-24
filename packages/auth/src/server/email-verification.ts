import { emit, ForbiddenError, UnauthorizedError } from "@monark/common"
import { getDb } from "@monark/db"
import type { EmailVerifiedEvent } from "../contracts/events"

export const RESEND_WINDOW_MS = 60 * 60 * 1000 // one hour
export const RESEND_MAX_PER_WINDOW = 5

export type ResendResult = {
  sent: boolean
  remainingInWindow: number
  retryAfterSeconds?: number
}

// Records an attempt if under the cap; returns the updated remaining count so
// callers can display "N resends left this hour."
export async function recordResendAttempt(userId: string): Promise<ResendResult> {
  const db = getDb()
  const since = new Date(Date.now() - RESEND_WINDOW_MS)
  const recent = await db.emailResendAttempt.findMany({
    where: { userId, at: { gte: since } },
    orderBy: { at: "asc" },
  })
  if (recent.length >= RESEND_MAX_PER_WINDOW) {
    const earliest = recent[0]!.at
    const retryAfterMs = earliest.getTime() + RESEND_WINDOW_MS - Date.now()
    return {
      sent: false,
      remainingInWindow: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    }
  }
  await db.emailResendAttempt.create({ data: { userId } })
  return {
    sent: true,
    remainingInWindow: RESEND_MAX_PER_WINDOW - (recent.length + 1),
  }
}

// Marks our `User.emailVerifiedAt` once Supabase has confirmed the token.
// The actual token exchange happens in the web-side /auth/confirm route
// (Supabase's `verifyOtp` needs the server-client cookies); this helper updates
// our shadow table and emits the domain event.
export async function markEmailVerified(userId: string): Promise<void> {
  const db = getDb()
  const existing = await db.user.findUnique({ where: { id: userId } })
  if (!existing) return
  if (existing.emailVerifiedAt) return

  const updated = await db.user.update({
    where: { id: userId },
    data: { emailVerifiedAt: new Date() },
  })

  const event: EmailVerifiedEvent = {
    type: "user.email-verified",
    userId: updated.id,
    email: updated.email,
    occurredAt: new Date(),
  }
  await emit(event)
}

export async function requireVerifiedEmail(ctx: {
  userId: string | null
}): Promise<{ userId: string }> {
  if (!ctx.userId) throw new UnauthorizedError()
  const db = getDb()
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { emailVerifiedAt: true },
  })
  if (!user) throw new UnauthorizedError()
  if (!user.emailVerifiedAt) {
    throw new ForbiddenError("Email not verified. Check your inbox to confirm.")
  }
  return { userId: ctx.userId }
}
