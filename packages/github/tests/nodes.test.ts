import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeExecutionContext } from "@monark/automation/server";

// Stub the one network boundary — `githubRequest` — while keeping the real
// `pickString` / `pickNumber` output readers, so the node executors run end to
// end (config parse → token resolve → request shape → output mapping) without
// touching the network.
vi.mock("../src/server/client", async (importActual) => {
  const actual = await importActual<typeof import("../src/server/client")>();
  return { ...actual, githubRequest: vi.fn() };
});

import { githubRequest } from "../src/server/client";
import {
  clampLimit,
  requireRepo,
  requireToken,
  splitList,
} from "../src/server/nodes/shared";
import {
  githubAddLabelsNode,
  githubCommentNode,
  githubCreateIssueNode,
  githubGetIssueNode,
  githubListIssuesNode,
  githubSetIssueStateNode,
} from "../src/server/nodes/issues";
import {
  githubCreatePullRequestNode,
  githubGetPullRequestNode,
  githubListCommitsNode,
  githubRequestReviewNode,
} from "../src/server/nodes/pulls";
import { githubSearchIssuesNode } from "../src/server/nodes/search";

const req = vi.mocked(githubRequest);

function makeCtx(secret: string | null = "ghp_tok"): NodeExecutionContext {
  return { getSecret: vi.fn(async () => secret) } as unknown as NodeExecutionContext;
}

// The single request arg the executor built.
const call = () => req.mock.calls[0]?.[0] as { method: string; path: string; body?: unknown };

beforeEach(() => req.mockReset());

describe("github node helpers", () => {
  it("requireToken resolves the org secret, and rejects a missing / unset one", async () => {
    await expect(requireToken(makeCtx("t"), "my-secret")).resolves.toBe("t");
    await expect(requireToken(makeCtx(), "")).rejects.toThrow(/No token secret/);
    await expect(requireToken(makeCtx(null), "my-secret")).rejects.toThrow(/is not set/);
  });

  it("requireRepo parses owner/name and rejects malformed input", () => {
    expect(requireRepo("octo/hello")).toEqual({ owner: "octo", name: "hello" });
    expect(requireRepo("https://github.com/octo/hello")).toEqual({ owner: "octo", name: "hello" });
    expect(() => requireRepo("no-slash")).toThrow(/Invalid repository/);
    expect(() => requireRepo(42)).toThrow(/Repository is required/);
  });

  it("splitList trims + drops empties across commas and newlines", () => {
    expect(splitList("bug, p1\n , enhancement")).toEqual(["bug", "p1", "enhancement"]);
    expect(splitList(undefined)).toEqual([]);
  });

  it("clampLimit clamps into 1..100 with a fallback for junk", () => {
    expect(clampLimit(30)).toBe(30);
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(9999)).toBe(100);
    expect(clampLimit("nope")).toBe(30);
    expect(clampLimit(undefined, 15)).toBe(15);
  });
});

describe("github issue nodes", () => {
  it("create-issue POSTs title/body/labels and maps the response", async () => {
    req.mockResolvedValue({ number: 7, html_url: "https://x/7", id: 100 });
    const out = await githubCreateIssueNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      title: "Bug",
      body: "broken",
      labels: "bug, p1",
    });
    expect(call()).toEqual({
      token: "ghp_tok",
      method: "POST",
      path: "/repos/octo/hello/issues",
      body: { title: "Bug", body: "broken", labels: ["bug", "p1"] },
    });
    expect(out).toEqual({ issueNumber: 7, url: "https://x/7", id: 100 });
  });

  it("get-issue GETs by number and maps author from the nested user", async () => {
    req.mockResolvedValue({
      number: 5,
      title: "T",
      body: "B",
      state: "open",
      html_url: "u",
      user: { login: "octocat" },
    });
    const out = await githubGetIssueNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      issueNumber: 5,
    });
    expect(call().method).toBe("GET");
    expect(call().path).toBe("/repos/octo/hello/issues/5");
    expect(out).toEqual({
      number: 5,
      title: "T",
      body: "B",
      state: "open",
      url: "u",
      author: "octocat",
    });
  });

  it("list-issues passes state + labels + per_page and summarises the page", async () => {
    req.mockResolvedValue([{ number: 1, title: "a", state: "open", html_url: "u1" }]);
    const out = await githubListIssuesNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      state: "all",
      labels: "bug",
      limit: 10,
    });
    expect(call().method).toBe("GET");
    expect(call().path).toBe("/repos/octo/hello/issues?state=all&per_page=10&labels=bug");
    expect(out).toEqual({
      count: 1,
      issues: [{ number: 1, title: "a", state: "open", url: "u1" }],
    });
  });

  it("comment POSTs the body and returns the comment id + url", async () => {
    req.mockResolvedValue({ id: 55, html_url: "c" });
    const out = await githubCommentNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      issueNumber: 5,
      body: "hi there",
    });
    expect(call()).toEqual({
      token: "ghp_tok",
      method: "POST",
      path: "/repos/octo/hello/issues/5/comments",
      body: { body: "hi there" },
    });
    expect(out).toEqual({ commentId: 55, url: "c" });
  });

  it("add-labels POSTs the label list and rejects an empty one", async () => {
    req.mockResolvedValue([{ name: "bug" }, { name: "p1" }]);
    const out = await githubAddLabelsNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      issueNumber: 5,
      labels: "bug, p1",
    });
    expect(call().body).toEqual({ labels: ["bug", "p1"] });
    expect(out).toEqual({ labelCount: 2 });

    await expect(
      githubAddLabelsNode.run(makeCtx(), {
        token: "s",
        repository: "octo/hello",
        issueNumber: 5,
        labels: "   ",
      }),
    ).rejects.toThrow(/No labels/);
  });

  it("set-issue-state PATCHes the state", async () => {
    req.mockResolvedValue({ number: 5, state: "closed" });
    const out = await githubSetIssueStateNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      issueNumber: 5,
      state: "closed",
    });
    expect(call().method).toBe("PATCH");
    expect(call().body).toEqual({ state: "closed" });
    expect(out).toEqual({ number: 5, state: "closed" });
  });
});

describe("github pull-request nodes", () => {
  it("create-pull-request POSTs the branch pair + draft flag", async () => {
    req.mockResolvedValue({ number: 9, html_url: "p", id: 200 });
    const out = await githubCreatePullRequestNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      title: "Feature",
      head: "feat",
      base: "main",
      body: "desc",
      draft: true,
    });
    expect(call()).toEqual({
      token: "ghp_tok",
      method: "POST",
      path: "/repos/octo/hello/pulls",
      body: { title: "Feature", head: "feat", base: "main", body: "desc", draft: true },
    });
    expect(out).toEqual({ prNumber: 9, url: "p", id: 200 });
  });

  it("get-pull-request maps merged + head/base refs + author", async () => {
    req.mockResolvedValue({
      number: 9,
      title: "F",
      state: "open",
      merged: false,
      html_url: "p",
      head: { ref: "feat" },
      base: { ref: "main" },
      user: { login: "octocat" },
    });
    const out = await githubGetPullRequestNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      prNumber: 9,
    });
    expect(call().path).toBe("/repos/octo/hello/pulls/9");
    expect(out).toEqual({
      number: 9,
      title: "F",
      state: "open",
      merged: false,
      url: "p",
      headRef: "feat",
      baseRef: "main",
      author: "octocat",
    });
  });

  it("request-review POSTs reviewers and rejects an empty list", async () => {
    req.mockResolvedValue({});
    const out = await githubRequestReviewNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      prNumber: 9,
      reviewers: "alice, bob",
    });
    expect(call().path).toBe("/repos/octo/hello/pulls/9/requested_reviewers");
    expect(call().body).toEqual({ reviewers: ["alice", "bob"] });
    expect(out).toEqual({ requested: 2 });

    await expect(
      githubRequestReviewNode.run(makeCtx(), {
        token: "s",
        repository: "octo/hello",
        prNumber: 9,
        reviewers: "",
      }),
    ).rejects.toThrow(/No reviewers/);
  });

  it("list-commits passes sha + per_page and maps the commit list", async () => {
    req.mockResolvedValue([
      { sha: "abc", html_url: "c1", commit: { message: "msg", author: { name: "Al" } } },
    ]);
    const out = await githubListCommitsNode.run(makeCtx(), {
      token: "s",
      repository: "octo/hello",
      branch: "main",
      limit: 5,
    });
    expect(call().path).toBe("/repos/octo/hello/commits?per_page=5&sha=main");
    expect(out).toEqual({
      count: 1,
      commits: [{ sha: "abc", message: "msg", author: "Al", url: "c1" }],
    });
  });
});

describe("github search node", () => {
  it("search-issues GETs /search/issues and maps total_count + items", async () => {
    req.mockResolvedValue({
      total_count: 42,
      items: [{ number: 1, title: "a", html_url: "u1", state: "open" }],
    });
    const out = await githubSearchIssuesNode.run(makeCtx(), {
      token: "s",
      query: "repo:octo/hello is:issue",
      limit: 30,
    });
    expect(call().method).toBe("GET");
    expect(call().path).toMatch(/^\/search\/issues\?q=/);
    expect(out).toEqual({
      count: 1,
      total: 42,
      items: [{ number: 1, title: "a", url: "u1", state: "open" }],
    });
  });

  it("search-issues rejects an empty query before any request", async () => {
    await expect(
      githubSearchIssuesNode.run(makeCtx(), { token: "s", query: "   ", limit: 30 }),
    ).rejects.toThrow(/search query is required/);
    expect(req).not.toHaveBeenCalled();
  });
});
