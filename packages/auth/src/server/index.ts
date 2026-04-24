import { z } from "zod"
import { router, publicProcedure } from "@monark/common/trpc"
import { UnauthorizedError } from "@monark/common"
import { getById } from "@monark/users/server"
import { checkPassword } from "./password"

export const authRouter = router({
  ping: publicProcedure.query(() => ({
    pong: true,
    at: new Date().toISOString(),
  })),

  session: publicProcedure.query(({ ctx }) => ({
    userId: ctx.userId,
    activeOrganizationId: ctx.activeOrganizationId,
    signedIn: ctx.userId !== null,
  })),

  checkPassword: publicProcedure
    .input(
      z.object({
        password: z.string(),
        email: z.string().email().optional(),
        displayName: z.string().optional(),
      }),
    )
    .mutation(({ input }) =>
      checkPassword(input.password, {
        email: input.email,
        displayName: input.displayName,
      }),
    ),
})

// Reusable helpers used by server actions in services/web + by any future
// server-side auth orchestration.
export { signUpUser, signUpInputSchema } from "./signup"
export type { SignUpInput, SignUpResult, SignUpDeps } from "./signup"
export { emitSignedIn, emitSignedOut, emitPasswordChanged } from "./events"
export { checkPassword } from "./password"
export {
  markEmailVerified,
  recordResendAttempt,
  requireVerifiedEmail,
  RESEND_MAX_PER_WINDOW,
  RESEND_WINDOW_MS,
  type ResendResult,
} from "./email-verification"

// Read interface. Takes an explicit ctx so callers can use this from either
// tRPC procedures or Next server components.
export async function getCurrentUser(ctx: { userId: string | null }) {
  if (!ctx.userId) return null
  return getById(ctx.userId)
}

export async function requireUser(ctx: { userId: string | null }) {
  if (!ctx.userId) throw new UnauthorizedError()
  const user = await getById(ctx.userId)
  if (!user) throw new UnauthorizedError()
  return user
}
