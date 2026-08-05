import { randomBytes } from "node:crypto";
import { UnauthorizedError } from "@monark/common";
import { publicProcedure, router } from "@monark/common/trpc";
import { requireOrg } from "@monark/organizations/server";
import { requirePermission } from "@monark/rbac/server";
import { deleteSecret, listSecrets, setSecret } from "@monark/secrets/server";
import { GITHUB_WEBHOOK_SECRET_KEY } from "../contracts/github";

async function requireManageOrg(ctx: {
  userId: string | null;
  activeOrganizationId: string | null;
}) {
  if (!ctx.userId) throw new UnauthorizedError();
  const org = await requireOrg({
    userId: ctx.userId,
    activeOrganizationId: ctx.activeOrganizationId,
  });
  await requirePermission(ctx, "github.manage", org.id);
  return { org, userId: ctx.userId };
}

/** The org's GitHub connection : the inbound webhook secret + endpoint path. */
const connectionRouter = router({
  // Whether inbound webhooks are configured (the signing secret exists) + where
  // GitHub should POST. The web layer prepends the API origin to `webhookPath`.
  status: publicProcedure.query(async ({ ctx }) => {
    const { org } = await requireManageOrg(ctx);
    const secrets = await listSecrets(org.id);
    return {
      connected: secrets.some((s) => s.key === GITHUB_WEBHOOK_SECRET_KEY),
      webhookPath: `/hooks/github/${org.id}`,
    };
  }),

  // Generate (or rotate) the webhook signing secret. Returned in plaintext ONCE
  // so the operator can paste it into GitHub's webhook config ; it's write-only
  // in the secrets store thereafter, decrypted only server-side to verify a
  // delivery's signature.
  generateWebhookSecret: publicProcedure.mutation(async ({ ctx }) => {
    const { org, userId } = await requireManageOrg(ctx);
    const secret = randomBytes(24).toString("base64url");
    await setSecret({
      organizationId: org.id,
      key: GITHUB_WEBHOOK_SECRET_KEY,
      value: secret,
      description: "GitHub webhook signing secret (verifies inbound X-Hub-Signature-256).",
      createdBy: userId,
    });
    return { secret, webhookPath: `/hooks/github/${org.id}` };
  }),

  // Remove the webhook secret ; inbound deliveries then 404 until reconnected.
  disconnect: publicProcedure.mutation(async ({ ctx }) => {
    const { org } = await requireManageOrg(ctx);
    await deleteSecret(org.id, GITHUB_WEBHOOK_SECRET_KEY);
    return { ok: true };
  }),
});

export const githubRouter = router({
  connection: connectionRouter,
});
