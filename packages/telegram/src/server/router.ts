import { randomBytes } from "node:crypto";
import { z } from "zod";
import { UnauthorizedError } from "@monark/common";
import { publicProcedure, router } from "@monark/common/trpc";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import { deleteSecret, getSecretValue, listSecrets, setSecret } from "@monark/secrets/server";
import { TELEGRAM_BOT_TOKEN_KEY, TELEGRAM_WEBHOOK_SECRET_KEY } from "../contracts/telegram";
import { telegramCall } from "./client";

// The org's Telegram connection. Unlike the shared `makeConnectionSecretRouter`
// (GitHub / a generic webhook), Telegram's connect does more than mint a secret:
// it stores the bot token *and* registers the webhook with Telegram in one call
// (`setWebhook`), which also validates the token. So this is a bespoke router
// rather than the kit helper. Both secrets live in the `@monark/secrets`
// substrate under fixed keys ; "connected" == the bot token is stored. Gated on
// `telegram.manage`.

type ManageCtx = { userId: string | null; activeOrganizationId: string | null };

const webhookPath = (orgId: string) => `/hooks/telegram/${orgId}`;

async function requireManage(ctx: ManageCtx) {
  if (!ctx.userId) throw new UnauthorizedError();
  const org = await requireOrg({
    userId: ctx.userId,
    activeOrganizationId: ctx.activeOrganizationId,
  });
  await requirePermission(ctx, "telegram.manage", org.id);
  return { org, userId: ctx.userId };
}

export const telegramRouter = router({
  connection: router({
    status: publicProcedure.query(async ({ ctx }) => {
      const { org } = await requireManage(ctx);
      const secrets = await listSecrets(org.id);
      return {
        connected: secrets.some((s) => s.key === TELEGRAM_BOT_TOKEN_KEY),
        webhookRegistered: secrets.some((s) => s.key === TELEGRAM_WEBHOOK_SECRET_KEY),
        webhookPath: webhookPath(org.id),
      };
    }),

    // Store the bot token, mint the inbound secret, and register the webhook with
    // Telegram. `apiOrigin` is this app's public API origin (the browser knows it
    // via NEXT_PUBLIC_API_URL) — the org id is appended server-side so a caller
    // can't point the webhook at another org. `setWebhook` is called *first* : it
    // validates the token, so nothing is persisted if the token is bad or the
    // origin isn't a public HTTPS URL Telegram will accept.
    connect: publicProcedure
      .input(
        z.object({
          botToken: z.string().trim().min(1),
          apiOrigin: z.string().trim().url(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const { org, userId } = await requireManage(ctx);
        const secret = randomBytes(24).toString("base64url");
        const origin = input.apiOrigin.replace(/\/+$/, "");
        const url = `${origin}${webhookPath(org.id)}`;

        await telegramCall(input.botToken, "setWebhook", {
          url,
          secret_token: secret,
          allowed_updates: ["message"],
        });

        await setSecret({
          organizationId: org.id,
          key: TELEGRAM_BOT_TOKEN_KEY,
          value: input.botToken,
          description: "Telegram bot token (from BotFather). Used by outbound nodes + connect.",
          createdBy: userId,
        });
        await setSecret({
          organizationId: org.id,
          key: TELEGRAM_WEBHOOK_SECRET_KEY,
          value: secret,
          description: "Telegram inbound webhook secret (X-Telegram-Bot-Api-Secret-Token).",
          createdBy: userId,
        });
        return { ok: true, webhookUrl: url };
      }),

    // Deregister the webhook with Telegram (best-effort — a revoked token or
    // network blip shouldn't strand the local secrets) and drop both secrets.
    disconnect: publicProcedure.mutation(async ({ ctx }) => {
      const { org } = await requireManage(ctx);
      const token = await getSecretValue(org.id, TELEGRAM_BOT_TOKEN_KEY);
      if (token) {
        try {
          await telegramCall(token, "deleteWebhook", {});
        } catch {
          // best-effort ; still clear local state below
        }
      }
      await deleteSecret(org.id, TELEGRAM_WEBHOOK_SECRET_KEY);
      await deleteSecret(org.id, TELEGRAM_BOT_TOKEN_KEY);
      return { ok: true };
    }),
  }),
});
