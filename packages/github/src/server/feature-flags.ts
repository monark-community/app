import { registerFlags } from "@monark/feature-flags/server";

// Ships dark : the module registers its nodes + events + webhook, but the
// `/github` connect surface and (by convention) new GitHub automations gate on
// this until an org opts in.
const GITHUB_FLAGS = {
  enabled: {
    description: "Enable the GitHub integration (connect a repo, GitHub trigger events + nodes).",
    defaultOn: false,
  },
} as const;

export function registerGithubFeatureFlags(): void {
  registerFlags("github", GITHUB_FLAGS);
}
