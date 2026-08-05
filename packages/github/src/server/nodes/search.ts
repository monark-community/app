import { z } from "zod";
import { defineNode } from "@monark/automation/server";
import { githubRequest, pickNumber, pickString } from "../client";
import { TOKEN_FIELD, clampLimit, requireToken } from "./shared";

/** Search issues + pull requests with GitHub's search syntax. */
export const githubSearchIssuesNode = defineNode({
  descriptor: {
    kind: "action",
    category: "github",
    label: "GitHub: Search issues/PRs",
    description: "Search issues and pull requests across repositories.",
    icon: "Github",
    inputs: [{ id: "in" }],
    outputs: [{ id: "out" }],
    outputFields: [
      { key: "count", type: "number", description: "How many results were returned." },
      { key: "total", type: "number", description: "Total matches (may exceed count)." },
      { key: "items", type: "object", description: "The results (number, title, url, repo)." },
    ],
    configFields: [
      TOKEN_FIELD,
      {
        key: "query",
        label: "Query",
        type: "text",
        required: true,
        placeholder: "repo:octo/hello is:issue is:open label:bug",
        help: "GitHub search syntax.",
      },
      { key: "limit", label: "Max results", type: "number", placeholder: "30" },
    ],
  },
  configSchema: z.object({
    token: z.string(),
    query: z.string(),
    limit: z.unknown().optional(),
  }),
  execute: async (ctx, config) => {
    const token = await requireToken(ctx, config.token);
    const query = String(config.query ?? "").trim();
    if (!query) throw new Error("A search query is required.");
    const params = new URLSearchParams({ q: query, per_page: String(clampLimit(config.limit)) });
    const result = await githubRequest({
      token,
      method: "GET",
      path: `/search/issues?${params.toString()}`,
    });
    const obj = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
    const items = Array.isArray(obj.items) ? obj.items : [];
    return {
      count: items.length,
      total: pickNumber(result, "total_count"),
      items: items.map((i) => ({
        number: pickNumber(i, "number"),
        title: pickString(i, "title"),
        url: pickString(i, "html_url"),
        state: pickString(i, "state"),
      })),
    };
  },
});
