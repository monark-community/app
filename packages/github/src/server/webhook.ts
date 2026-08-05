import { defineInboundWebhook, verifyHmacSha256 } from "@monark/integration-kit/server";
import { GITHUB_WEBHOOK_SECRET_KEY } from "../contracts/github";
import type { GithubEvents } from "../contracts/events";

// ── payload helpers (GitHub payloads are deep + loosely-typed JSON) ──────────
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

/**
 * Map a raw GitHub webhook (`X-GitHub-Event` name + JSON payload) to one of our
 * domain events, or null for a delivery we don't model (GitHub sends many event
 * types — we only translate the handful we expose as triggers). `organizationId`
 * is stamped so the automation + webhook subscribers can route it.
 */
export function mapGithubEvent(
  eventName: string,
  payload: unknown,
  organizationId: string,
): GithubEvents | null {
  const p = obj(payload);
  const action = str(p.action);
  const repo = str(obj(p.repository).full_name);
  const occurredAt = new Date();
  const base = { organizationId, repo, occurredAt };

  switch (eventName) {
    case "issues": {
      if (action !== "opened") return null;
      const issue = obj(p.issue);
      return {
        ...base,
        type: "github.issue-opened",
        issueNumber: num(issue.number),
        title: str(issue.title),
        body: str(issue.body),
        url: str(issue.html_url),
        author: str(obj(issue.user).login),
      };
    }
    case "issue_comment": {
      if (action !== "created") return null;
      const issue = obj(p.issue);
      const comment = obj(p.comment);
      return {
        ...base,
        type: "github.issue-commented",
        issueNumber: num(issue.number),
        isPullRequest: issue.pull_request != null,
        commentBody: str(comment.body),
        url: str(comment.html_url),
        author: str(obj(comment.user).login),
      };
    }
    case "pull_request": {
      const pr = obj(p.pull_request);
      if (action === "opened") {
        return {
          ...base,
          type: "github.pull-request-opened",
          prNumber: num(pr.number),
          title: str(pr.title),
          body: str(pr.body),
          url: str(pr.html_url),
          author: str(obj(pr.user).login),
          headRef: str(obj(pr.head).ref),
          baseRef: str(obj(pr.base).ref),
          draft: pr.draft === true,
        };
      }
      if (action === "closed" && pr.merged === true) {
        return {
          ...base,
          type: "github.pull-request-merged",
          prNumber: num(pr.number),
          title: str(pr.title),
          url: str(pr.html_url),
          author: str(obj(pr.user).login),
          mergedBy: str(obj(pr.merged_by).login),
          headRef: str(obj(pr.head).ref),
          baseRef: str(obj(pr.base).ref),
        };
      }
      return null;
    }
    case "pull_request_review": {
      if (action !== "submitted") return null;
      const review = obj(p.review);
      const pr = obj(p.pull_request);
      return {
        ...base,
        type: "github.pull-request-review-submitted",
        prNumber: num(pr.number),
        state: str(review.state),
        reviewer: str(obj(review.user).login),
        body: str(review.body),
        url: str(review.html_url),
      };
    }
    case "push": {
      const ref = str(p.ref);
      const head = obj(p.head_commit);
      return {
        ...base,
        type: "github.push",
        ref,
        branch: ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : "",
        commitCount: Array.isArray(p.commits) ? p.commits.length : 0,
        headCommitId: str(head.id),
        headCommitMessage: str(head.message),
        pusher: str(obj(p.pusher).name) || str(obj(p.sender).login),
      };
    }
    case "release": {
      if (action !== "published") return null;
      const release = obj(p.release);
      return {
        ...base,
        type: "github.release-published",
        tag: str(release.tag_name),
        name: str(release.name),
        body: str(release.body),
        url: str(release.html_url),
        prerelease: release.prerelease === true,
        author: str(obj(release.author).login),
      };
    }
    default:
      return null;
  }
}

/**
 * Handle one inbound GitHub webhook: the integration-kit helper resolves the
 * org's stored secret, verifies GitHub's `X-Hub-Signature-256` (HMAC-SHA256 over
 * the raw body, `sha256=` prefix), maps the delivery via {@link mapGithubEvent},
 * and emits it (the automation subscriber fires matching flows). Unmodeled
 * deliveries ack with 202 so GitHub doesn't retry.
 */
export const handleGithubWebhook = defineInboundWebhook<GithubEvents>({
  secretKey: GITHUB_WEBHOOK_SECRET_KEY,
  verify: (rawBody, secret, signature) =>
    verifyHmacSha256(rawBody, secret, signature, { prefix: "sha256=" }),
  map: mapGithubEvent,
  label: "github",
});
