import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions + payload-field metadata for the GitHub events,
// so they appear (grouped under "github") in the automation Event Trigger
// picker — with `{{ trigger.* }}` fields — and the webhooks subscription picker.
// `orgScoped: true` : each event belongs to the org the webhook is configured
// for (it carries `organizationId`), so subscriptions route per-org.
const REPO = {
  key: "repo",
  type: "string",
  description: "The repository, as owner/name.",
} as const;
const ORG = {
  key: "organizationId",
  type: "string",
  description: "The Monark organization the webhook is configured for.",
} as const;

const GITHUB_EVENT_TYPES = {
  "github.issue-opened": {
    description: "An issue was opened in a connected repository.",
    orgScoped: true,
    fields: [
      ORG,
      REPO,
      { key: "issueNumber", type: "number", description: "The issue number." },
      { key: "title", type: "string", description: "The issue title." },
      { key: "body", type: "string", description: "The issue body (markdown)." },
      { key: "url", type: "string", description: "The issue's HTML URL." },
      { key: "author", type: "string", description: "The login of the user who opened it." },
    ],
  },
  "github.issue-commented": {
    description: "A comment was added to an issue or pull request.",
    orgScoped: true,
    fields: [
      ORG,
      REPO,
      { key: "issueNumber", type: "number", description: "The issue / PR number." },
      { key: "isPullRequest", type: "boolean", description: "Whether the comment is on a PR." },
      { key: "commentBody", type: "string", description: "The comment text (markdown)." },
      { key: "url", type: "string", description: "The comment's HTML URL." },
      { key: "author", type: "string", description: "The commenter's login." },
    ],
  },
  "github.pull-request-opened": {
    description: "A pull request was opened.",
    orgScoped: true,
    fields: [
      ORG,
      REPO,
      { key: "prNumber", type: "number", description: "The pull request number." },
      { key: "title", type: "string", description: "The PR title." },
      { key: "body", type: "string", description: "The PR body (markdown)." },
      { key: "url", type: "string", description: "The PR's HTML URL." },
      { key: "author", type: "string", description: "The login of the user who opened it." },
      { key: "headRef", type: "string", description: "The source branch." },
      { key: "baseRef", type: "string", description: "The target branch." },
      { key: "draft", type: "boolean", description: "Whether the PR is a draft." },
    ],
  },
  "github.pull-request-merged": {
    description: "A pull request was merged.",
    orgScoped: true,
    fields: [
      ORG,
      REPO,
      { key: "prNumber", type: "number", description: "The pull request number." },
      { key: "title", type: "string", description: "The PR title." },
      { key: "url", type: "string", description: "The PR's HTML URL." },
      { key: "author", type: "string", description: "The PR author's login." },
      { key: "mergedBy", type: "string", description: "The login of who merged it." },
      { key: "headRef", type: "string", description: "The source branch." },
      { key: "baseRef", type: "string", description: "The target branch." },
    ],
  },
  "github.pull-request-review-submitted": {
    description: "A review was submitted on a pull request (approved / changes requested / …).",
    orgScoped: true,
    fields: [
      ORG,
      REPO,
      { key: "prNumber", type: "number", description: "The pull request number." },
      { key: "state", type: "string", description: "approved | changes_requested | commented." },
      { key: "reviewer", type: "string", description: "The reviewer's login." },
      { key: "body", type: "string", description: "The review body (markdown)." },
      { key: "url", type: "string", description: "The review's HTML URL." },
    ],
  },
  "github.push": {
    description: "Commits were pushed to a branch.",
    orgScoped: true,
    fields: [
      ORG,
      REPO,
      { key: "ref", type: "string", description: "The full git ref, e.g. refs/heads/main." },
      { key: "branch", type: "string", description: "The short branch name." },
      { key: "commitCount", type: "number", description: "How many commits were pushed." },
      { key: "headCommitId", type: "string", description: "The head commit SHA." },
      { key: "headCommitMessage", type: "string", description: "The head commit message." },
      { key: "pusher", type: "string", description: "The login of who pushed." },
    ],
  },
  "github.release-published": {
    description: "A release was published.",
    orgScoped: true,
    fields: [
      ORG,
      REPO,
      { key: "tag", type: "string", description: "The release's git tag." },
      { key: "name", type: "string", description: "The release name." },
      { key: "body", type: "string", description: "The release notes (markdown)." },
      { key: "url", type: "string", description: "The release's HTML URL." },
      { key: "prerelease", type: "boolean", description: "Whether it's a pre-release." },
      { key: "author", type: "string", description: "The login of who published it." },
    ],
  },
} as const;

export function registerGithubEventTypes(): void {
  registerEventTypes("github", GITHUB_EVENT_TYPES);
}
