import { makeConnectionSecretRouter } from "@monark/integration-kit/server";
import { router } from "@monark/common/trpc";
import { GITHUB_WEBHOOK_SECRET_KEY } from "../contracts/github";

// The org's GitHub connection : the inbound webhook signing secret + endpoint
// path, managed by the shared integration-kit router (status / generate / drop),
// gated on `github.manage`.
export const githubRouter = router({
  connection: makeConnectionSecretRouter({
    secretKey: GITHUB_WEBHOOK_SECRET_KEY,
    permission: "github.manage",
    webhookPathPrefix: "/hooks/github",
    secretDescription: "GitHub webhook signing secret (verifies inbound X-Hub-Signature-256).",
  }),
});
