import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events the GitHub module emits from an inbound GitHub webhook, mapped
// into the Monark event bus so automations can trigger on them. Every event
// carries `organizationId` (the Monark org the webhook is configured for) —
// that's how the automation + webhook subscribers route it — plus `repo` as a
// `"owner/name"` string, so an automation can reference `{{ trigger.repo }}`,
// `{{ trigger.issueNumber }}`, etc. Payloads are intentionally flat + shallow:
// the useful scalars a flow acts on, not the whole GitHub object.

export type GithubIssueOpenedEvent = DomainEventBase & {
  type: "github.issue-opened";
  organizationId: string;
  repo: string;
  issueNumber: number;
  title: string;
  body: string;
  url: string;
  author: string;
};

export type GithubIssueCommentedEvent = DomainEventBase & {
  type: "github.issue-commented";
  organizationId: string;
  repo: string;
  issueNumber: number;
  /** True when the comment is on a pull request (GitHub treats PRs as issues). */
  isPullRequest: boolean;
  commentBody: string;
  url: string;
  author: string;
};

export type GithubPullRequestOpenedEvent = DomainEventBase & {
  type: "github.pull-request-opened";
  organizationId: string;
  repo: string;
  prNumber: number;
  title: string;
  body: string;
  url: string;
  author: string;
  headRef: string;
  baseRef: string;
  draft: boolean;
};

export type GithubPullRequestMergedEvent = DomainEventBase & {
  type: "github.pull-request-merged";
  organizationId: string;
  repo: string;
  prNumber: number;
  title: string;
  url: string;
  author: string;
  mergedBy: string;
  headRef: string;
  baseRef: string;
};

export type GithubPullRequestReviewSubmittedEvent = DomainEventBase & {
  type: "github.pull-request-review-submitted";
  organizationId: string;
  repo: string;
  prNumber: number;
  /** `approved` | `changes_requested` | `commented` | `dismissed`. */
  state: string;
  reviewer: string;
  body: string;
  url: string;
};

export type GithubPushEvent = DomainEventBase & {
  type: "github.push";
  organizationId: string;
  repo: string;
  /** Full git ref, e.g. `refs/heads/main`. */
  ref: string;
  /** Short branch name, e.g. `main` (empty for a tag push). */
  branch: string;
  commitCount: number;
  headCommitId: string;
  headCommitMessage: string;
  pusher: string;
};

export type GithubReleasePublishedEvent = DomainEventBase & {
  type: "github.release-published";
  organizationId: string;
  repo: string;
  tag: string;
  name: string;
  body: string;
  url: string;
  prerelease: boolean;
  author: string;
};

export type GithubEvents =
  | GithubIssueOpenedEvent
  | GithubIssueCommentedEvent
  | GithubPullRequestOpenedEvent
  | GithubPullRequestMergedEvent
  | GithubPullRequestReviewSubmittedEvent
  | GithubPushEvent
  | GithubReleasePublishedEvent;
