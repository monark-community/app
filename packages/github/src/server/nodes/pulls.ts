import { z } from "zod";
import { defineNode } from "@monark/automation/server";
import { githubRequest, pickNumber, pickString } from "../client";
import {
  REPO_FIELD,
  TOKEN_FIELD,
  clampLimit,
  requireRepo,
  requireToken,
  splitList,
} from "./shared";

const ICON = "Github";
const CATEGORY = "github";

/** Open a pull request. */
export const githubCreatePullRequestNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: Create pull request",
    description: "Open a pull request from one branch into another.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "prNumber", type: "number", description: "The created PR's number." },
      { key: "url", type: "string", description: "The PR's HTML URL." },
      { key: "id", type: "number", description: "The PR's GitHub id." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "title", label: "Title", type: "text", required: true },
      {
        key: "head",
        label: "Head branch",
        type: "text",
        required: true,
        help: "The source branch.",
      },
      {
        key: "base",
        label: "Base branch",
        type: "text",
        required: true,
        help: "The target branch.",
      },
      { key: "body", label: "Body", type: "textarea" },
      { key: "draft", label: "Draft", type: "boolean" },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    title: z.string(),
    head: z.string(),
    base: z.string(),
    body: z.unknown().optional(),
    draft: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const pr = await githubRequest({
      token,
      method: "POST",
      path: `/repos/${owner}/${name}/pulls`,
      body: {
        title: String(config.title ?? ""),
        head: String(config.head ?? ""),
        base: String(config.base ?? ""),
        body: String(config.body ?? ""),
        draft: config.draft === true || config.draft === "true",
      },
    });
    return {
      prNumber: pickNumber(pr, "number"),
      url: pickString(pr, "html_url"),
      id: pickNumber(pr, "id"),
    };
  },
});

/** Read a single pull request. */
export const githubGetPullRequestNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: Get pull request",
    description: "Fetch one pull request by number.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "number", type: "number", description: "The PR number." },
      { key: "title", type: "string", description: "The PR title." },
      { key: "state", type: "string", description: "open or closed." },
      { key: "merged", type: "boolean", description: "Whether it has been merged." },
      { key: "url", type: "string", description: "The PR's HTML URL." },
      { key: "headRef", type: "string", description: "The source branch." },
      { key: "baseRef", type: "string", description: "The target branch." },
      { key: "author", type: "string", description: "The PR author's login." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "prNumber", label: "PR number", type: "number", required: true },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    prNumber: z.coerce.number(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const pr = await githubRequest({
      token,
      method: "GET",
      path: `/repos/${owner}/${name}/pulls/${config.prNumber}`,
    });
    const obj = pr && typeof pr === "object" ? (pr as Record<string, unknown>) : {};
    return {
      number: pickNumber(pr, "number"),
      title: pickString(pr, "title"),
      state: pickString(pr, "state"),
      merged: obj.merged === true,
      url: pickString(pr, "html_url"),
      headRef: pickString(obj.head, "ref"),
      baseRef: pickString(obj.base, "ref"),
      author: pickString(obj.user, "login"),
    };
  },
});

/** Request reviewers on a pull request. */
export const githubRequestReviewNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: Request review",
    description: "Request one or more reviewers on a pull request.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "requested", type: "number", description: "How many reviewers were requested." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "prNumber", label: "PR number", type: "number", required: true },
      {
        key: "reviewers",
        label: "Reviewers",
        type: "text",
        required: true,
        help: "Comma-separated GitHub logins.",
      },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    prNumber: z.coerce.number(),
    reviewers: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const reviewers = splitList(config.reviewers);
    if (reviewers.length === 0) throw new Error("No reviewers to request.");
    await githubRequest({
      token,
      method: "POST",
      path: `/repos/${owner}/${name}/pulls/${config.prNumber}/requested_reviewers`,
      body: { reviewers },
    });
    return { requested: reviewers.length };
  },
});

/** List recent commits on a branch. */
export const githubListCommitsNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: List commits",
    description: "List recent commits on a branch.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "count", type: "number", description: "How many commits were returned." },
      { key: "commits", type: "object", description: "The commits (sha, message, author, url)." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "branch", label: "Branch / SHA", type: "text", placeholder: "main" },
      { key: "limit", label: "Max results", type: "number", placeholder: "30" },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    branch: z.unknown().optional(),
    limit: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const params = new URLSearchParams({ per_page: String(clampLimit(config.limit)) });
    if (typeof config.branch === "string" && config.branch.trim()) {
      params.set("sha", config.branch.trim());
    }
    const result = await githubRequest({
      token,
      method: "GET",
      path: `/repos/${owner}/${name}/commits?${params.toString()}`,
    });
    const commits = Array.isArray(result) ? result : [];
    return {
      count: commits.length,
      commits: commits.map((c) => {
        const obj = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
        return {
          sha: pickString(c, "sha"),
          message: pickString(obj.commit, "message"),
          author: pickString(
            obj.commit && typeof obj.commit === "object"
              ? (obj.commit as { author?: unknown }).author
              : null,
            "name",
          ),
          url: pickString(c, "html_url"),
        };
      }),
    };
  },
});
