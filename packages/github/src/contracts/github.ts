/**
 * Shared GitHub-module constants + small types, safe for both client and
 * server. The event *payload* shapes live in [events.ts](./events.ts) ; this is
 * the connection-level plumbing (secret key names, event-type strings).
 */

/**
 * The org secret (in the `@monark/secrets` substrate) holding the shared HMAC
 * key GitHub signs inbound webhooks with. The inbound handler reads it to verify
 * `X-Hub-Signature-256`. "Connected" == this secret exists for the org.
 */
export const GITHUB_WEBHOOK_SECRET_KEY = "github.webhook-secret";

/** Fully-qualified domain-event type strings this module emits (trigger sources). */
export const GITHUB_EVENT_TYPES = {
  issueOpened: "github.issue-opened",
  issueCommented: "github.issue-commented",
  pullRequestOpened: "github.pull-request-opened",
  pullRequestMerged: "github.pull-request-merged",
  pullRequestReviewSubmitted: "github.pull-request-review-submitted",
  push: "github.push",
  releasePublished: "github.release-published",
} as const;

/** A `owner/name` repository reference as it rides on events + node config. */
export interface GithubRepoRef {
  owner: string;
  name: string;
}

/**
 * Parse an `"owner/name"` string into its parts, or null if malformed. Used by
 * nodes to turn a `repository` config value (often `{{ trigger.repo }}`) into an
 * API path. Tolerates a full URL suffix and surrounding whitespace.
 */
export function parseRepoRef(value: string): GithubRepoRef | null {
  const trimmed = value.trim().replace(/^https?:\/\/github\.com\//i, "");
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  if (!match || !match[1] || !match[2]) return null;
  return { owner: match[1], name: match[2] };
}
