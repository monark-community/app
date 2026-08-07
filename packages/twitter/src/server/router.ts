import { z } from "zod";
import { UnauthorizedError } from "@monark/common";
import { publicProcedure, router } from "@monark/common/trpc";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import { deleteSecret, listSecrets, setSecret } from "@monark/secrets/server";
import {
  TWITTER_ACCESS_TOKEN_SECRET,
  TWITTER_ACCESS_TOKEN_SECRET_SECRET,
  TWITTER_CONSUMER_KEY_SECRET,
  TWITTER_CONSUMER_SECRET_SECRET,
  TWITTER_SECRET_KEYS,
} from "../contracts/twitter";

// The org's X (Twitter) connection : the four OAuth 1.0a credentials, stored in
// the `@monark/secrets` substrate. Unlike GitHub / Telegram there's no inbound
// webhook to register — `connect` just stores the credentials (write-only
// integration). We deliberately don't verify them with a live call at connect
// time : X's free tier restricts the read endpoints (`GET /2/users/me`) that
// would validate them, so a valid write-only credential set would wrongly fail
// verification — the first post-tweet run surfaces any auth error instead.
// Gated on `twitter.manage`.

type ManageCtx = { userId: string | null; activeOrganizationId: string | null };

async function requireManage(ctx: ManageCtx) {
  if (!ctx.userId) throw new UnauthorizedError();
  const org = await requireOrg({
    userId: ctx.userId,
    activeOrganizationId: ctx.activeOrganizationId,
  });
  await requirePermission(ctx, "twitter.manage", org.id);
  return { org, userId: ctx.userId };
}

export const twitterRouter = router({
  connection: router({
    status: publicProcedure.query(async ({ ctx }) => {
      const { org } = await requireManage(ctx);
      const keys = new Set((await listSecrets(org.id)).map((s) => s.key));
      return { connected: TWITTER_SECRET_KEYS.every((k) => keys.has(k)) };
    }),

    connect: publicProcedure
      .input(
        z.object({
          consumerKey: z.string().trim().min(1),
          consumerSecret: z.string().trim().min(1),
          accessToken: z.string().trim().min(1),
          accessTokenSecret: z.string().trim().min(1),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { org, userId } = await requireManage(ctx);
        const entries: Array<[string, string, string]> = [
          [
            TWITTER_CONSUMER_KEY_SECRET,
            input.consumerKey,
            "X (Twitter) OAuth 1.0a consumer (API) key.",
          ],
          [
            TWITTER_CONSUMER_SECRET_SECRET,
            input.consumerSecret,
            "X (Twitter) OAuth 1.0a consumer (API) secret.",
          ],
          [TWITTER_ACCESS_TOKEN_SECRET, input.accessToken, "X (Twitter) OAuth 1.0a access token."],
          [
            TWITTER_ACCESS_TOKEN_SECRET_SECRET,
            input.accessTokenSecret,
            "X (Twitter) OAuth 1.0a access token secret.",
          ],
        ];
        for (const [key, value, description] of entries) {
          await setSecret({ organizationId: org.id, key, value, description, createdBy: userId });
        }
        return { ok: true };
      }),

    disconnect: publicProcedure.mutation(async ({ ctx }) => {
      const { org } = await requireManage(ctx);
      for (const key of TWITTER_SECRET_KEYS) {
        await deleteSecret(org.id, key);
      }
      return { ok: true };
    }),
  }),
});
