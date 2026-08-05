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

/** Create an issue. */
export const githubCreateIssueNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: Create issue",
    description: "Open a new issue in a repository.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "issueNumber", type: "number", description: "The created issue's number." },
      { key: "url", type: "string", description: "The issue's HTML URL." },
      { key: "id", type: "number", description: "The issue's GitHub id." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "title", label: "Title", type: "text", required: true },
      { key: "body", label: "Body", type: "textarea" },
      { key: "labels", label: "Labels", type: "text", help: "Comma-separated label names." },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    title: z.string(),
    body: z.unknown().optional(),
    labels: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const labels = splitList(config.labels);
    const issue = await githubRequest({
      token,
      method: "POST",
      path: `/repos/${owner}/${name}/issues`,
      body: {
        title: String(config.title ?? ""),
        body: String(config.body ?? ""),
        ...(labels.length > 0 ? { labels } : {}),
      },
    });
    return {
      issueNumber: pickNumber(issue, "number"),
      url: pickString(issue, "html_url"),
      id: pickNumber(issue, "id"),
    };
  },
});

/** Read a single issue. */
export const githubGetIssueNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: Get issue",
    description: "Fetch one issue by number.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "number", type: "number", description: "The issue number." },
      { key: "title", type: "string", description: "The issue title." },
      { key: "body", type: "string", description: "The issue body." },
      { key: "state", type: "string", description: "open or closed." },
      { key: "url", type: "string", description: "The issue's HTML URL." },
      { key: "author", type: "string", description: "The issue author's login." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "issueNumber", label: "Issue number", type: "number", required: true },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    issueNumber: z.coerce.number(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const issue = await githubRequest({
      token,
      method: "GET",
      path: `/repos/${owner}/${name}/issues/${config.issueNumber}`,
    });
    return {
      number: pickNumber(issue, "number"),
      title: pickString(issue, "title"),
      body: pickString(issue, "body"),
      state: pickString(issue, "state"),
      url: pickString(issue, "html_url"),
      author: pickString(
        issue && typeof issue === "object" ? (issue as { user?: unknown }).user : null,
        "login",
      ),
    };
  },
});

/** List issues (open/closed/all, optionally by label). */
export const githubListIssuesNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: List issues",
    description: "List a repository's issues.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "count", type: "number", description: "How many issues were returned." },
      { key: "issues", type: "object", description: "The issue objects (number, title, url, …)." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      {
        key: "state",
        label: "State",
        type: "select",
        options: [
          { value: "open", label: "Open" },
          { value: "closed", label: "Closed" },
          { value: "all", label: "All" },
        ],
      },
      { key: "labels", label: "Labels", type: "text", help: "Comma-separated ; issues with all." },
      { key: "limit", label: "Max results", type: "number", placeholder: "30" },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    state: z.unknown().optional(),
    labels: z.unknown().optional(),
    limit: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const state = typeof config.state === "string" && config.state ? config.state : "open";
    const labels = splitList(config.labels);
    const params = new URLSearchParams({ state, per_page: String(clampLimit(config.limit)) });
    if (labels.length > 0) params.set("labels", labels.join(","));
    const result = await githubRequest({
      token,
      method: "GET",
      path: `/repos/${owner}/${name}/issues?${params.toString()}`,
    });
    const issues = Array.isArray(result) ? result : [];
    return {
      count: issues.length,
      issues: issues.map((i) => ({
        number: pickNumber(i, "number"),
        title: pickString(i, "title"),
        state: pickString(i, "state"),
        url: pickString(i, "html_url"),
      })),
    };
  },
});

/** Comment on an issue or pull request (same endpoint). */
export const githubCommentNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: Comment on issue/PR",
    description: "Add a comment to an issue or pull request.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "commentId", type: "number", description: "The created comment's id." },
      { key: "url", type: "string", description: "The comment's HTML URL." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "issueNumber", label: "Issue / PR number", type: "number", required: true },
      { key: "body", label: "Comment", type: "textarea", required: true },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    issueNumber: z.coerce.number(),
    body: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const comment = await githubRequest({
      token,
      method: "POST",
      path: `/repos/${owner}/${name}/issues/${config.issueNumber}/comments`,
      body: { body: String(config.body ?? "") },
    });
    return { commentId: pickNumber(comment, "id"), url: pickString(comment, "html_url") };
  },
});

/** Add labels to an issue / PR. */
export const githubAddLabelsNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: Add labels",
    description: "Add one or more labels to an issue or pull request.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "labelCount", type: "number", description: "How many labels the issue now has." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "issueNumber", label: "Issue / PR number", type: "number", required: true },
      { key: "labels", label: "Labels", type: "text", required: true, help: "Comma-separated." },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    issueNumber: z.coerce.number(),
    labels: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const labels = splitList(config.labels);
    if (labels.length === 0) throw new Error("No labels to add.");
    const result = await githubRequest({
      token,
      method: "POST",
      path: `/repos/${owner}/${name}/issues/${config.issueNumber}/labels`,
      body: { labels },
    });
    return { labelCount: Array.isArray(result) ? result.length : 0 };
  },
});

/** Close or reopen an issue. */
export const githubSetIssueStateNode = defineNode({
  descriptor: {
    kind: "action",
    category: CATEGORY,
    label: "GitHub: Set issue state",
    description: "Close or reopen an issue.",
    icon: ICON,
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "number", type: "number", description: "The issue number." },
      { key: "state", type: "string", description: "The resulting state." },
    ],
    configFields: [
      TOKEN_FIELD,
      REPO_FIELD,
      { key: "issueNumber", label: "Issue number", type: "number", required: true },
      {
        key: "state",
        label: "State",
        type: "select",
        required: true,
        options: [
          { value: "closed", label: "Closed" },
          { value: "open", label: "Open" },
        ],
      },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    repository: z.string(),
    issueNumber: z.coerce.number(),
    state: z.enum(["open", "closed"]),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const { owner, name } = requireRepo(config.repository);
    const issue = await githubRequest({
      token,
      method: "PATCH",
      path: `/repos/${owner}/${name}/issues/${config.issueNumber}`,
      body: { state: config.state },
    });
    return { number: pickNumber(issue, "number"), state: pickString(issue, "state") };
  },
});
