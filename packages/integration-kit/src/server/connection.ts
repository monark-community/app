import { randomBytes } from "node:crypto";
import { UnauthorizedError } from "@monark/common";
import { publicProcedure, router } from "@monark/common/trpc";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import { deleteSecret, listSecrets, setSecret } from "@monark/secrets/server";

type ManageCtx = { userId: string | null; activeOrganizationId: string | null };

/**
 * The connection surface shared by every webhook integration: a per-org signing
 * secret kept in the `@monark/secrets` substrate + the inbound endpoint path.
 * `status` reports whether it's connected + where the provider should POST ;
 * `generateWebhookSecret` mints (or rotates) the secret and returns it once (it's
 * write-only in the store thereafter, decrypted server-side only to verify a
 * delivery — see {@link defineInboundWebhook}) ; `disconnect` removes it. All
 * gated by `permission`.
 */
export function makeConnectionSecretRouter(config: {
  /** Secrets-substrate key the signing secret is stored under. */
  secretKey: string;
  /** RBAC permission required to manage the connection (e.g. `"github.manage"`). */
  permission: string;
  /** Inbound endpoint prefix ; the org id is appended (e.g. `"/hooks/github"`). */
  webhookPathPrefix: string;
  /** Description stored on the secret. */
  secretDescription: string;
}) {
  const requireManage = async (ctx: ManageCtx) => {
    if (!ctx.userId) throw new UnauthorizedError();
    const org = await requireOrg({
      userId: ctx.userId,
      activeOrganizationId: ctx.activeOrganizationId,
    });
    await requirePermission(ctx, config.permission, org.id);
    return { org, userId: ctx.userId };
  };
  const webhookPath = (orgId: string) => `${config.webhookPathPrefix}/${orgId}`;

  return router({
    status: publicProcedure.query(async ({ ctx }) => {
      const { org } = await requireManage(ctx);
      const secrets = await listSecrets(org.id);
      return {
        connected: secrets.some((s) => s.key === config.secretKey),
        webhookPath: webhookPath(org.id),
      };
    }),

    generateWebhookSecret: publicProcedure.mutation(async ({ ctx }) => {
      const { org, userId } = await requireManage(ctx);
      const secret = randomBytes(24).toString("base64url");
      await setSecret({
        organizationId: org.id,
        key: config.secretKey,
        value: secret,
        description: config.secretDescription,
        createdBy: userId,
      });
      return { secret, webhookPath: webhookPath(org.id) };
    }),

    disconnect: publicProcedure.mutation(async ({ ctx }) => {
      const { org } = await requireManage(ctx);
      await deleteSecret(org.id, config.secretKey);
      return { ok: true };
    }),
  });
}
