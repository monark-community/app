import { registerAutomationNodes } from "@monark/automation/server";
import {
  githubAddLabelsNode,
  githubCommentNode,
  githubCreateIssueNode,
  githubGetIssueNode,
  githubListIssuesNode,
  githubSetIssueStateNode,
} from "./issues";
import {
  githubCreatePullRequestNode,
  githubGetPullRequestNode,
  githubListCommitsNode,
  githubRequestReviewNode,
} from "./pulls";
import { githubSearchIssuesNode } from "./search";

let registered = false;

/**
 * Register the GitHub action nodes under the `github` namespace, exactly like
 * Core's `registerBuiltinAutomationNodes`. Called once at api boot. Idempotent.
 */
export function registerGithubAutomationNodes(): void {
  if (registered) return;
  registered = true;
  registerAutomationNodes("github", {
    // Issues
    "create-issue": githubCreateIssueNode,
    "get-issue": githubGetIssueNode,
    "list-issues": githubListIssuesNode,
    comment: githubCommentNode,
    "add-labels": githubAddLabelsNode,
    "set-issue-state": githubSetIssueStateNode,
    // Pull requests
    "create-pull-request": githubCreatePullRequestNode,
    "get-pull-request": githubGetPullRequestNode,
    "request-review": githubRequestReviewNode,
    "list-commits": githubListCommitsNode,
    // Search
    "search-issues": githubSearchIssuesNode,
  });
}
