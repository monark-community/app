import { describe, expect, it } from "vitest";
import { parseRepoRef } from "../src/contracts/github";
import { mapGithubEvent } from "../src/server/webhook";

const ORG = "org-1";

describe("parseRepoRef", () => {
  it("parses owner/name", () => {
    expect(parseRepoRef("octo/hello")).toEqual({ owner: "octo", name: "hello" });
  });
  it("strips a github.com URL prefix", () => {
    expect(parseRepoRef("https://github.com/octo/hello-world.js")).toEqual({
      owner: "octo",
      name: "hello-world.js",
    });
  });
  it("rejects malformed input", () => {
    expect(parseRepoRef("nope")).toBeNull();
    expect(parseRepoRef("a/b/c")).toBeNull();
    expect(parseRepoRef("")).toBeNull();
  });
});

describe("mapGithubEvent", () => {
  const repo = { full_name: "octo/hello" };

  it("maps issues.opened", () => {
    const e = mapGithubEvent(
      "issues",
      {
        action: "opened",
        repository: repo,
        issue: { number: 7, title: "Bug", body: "b", html_url: "u", user: { login: "alice" } },
      },
      ORG,
    );
    expect(e).toMatchObject({
      type: "github.issue-opened",
      organizationId: ORG,
      repo: "octo/hello",
      issueNumber: 7,
      title: "Bug",
      author: "alice",
    });
  });

  it("flags a comment on a PR", () => {
    const e = mapGithubEvent(
      "issue_comment",
      {
        action: "created",
        repository: repo,
        issue: { number: 3, pull_request: {} },
        comment: { body: "hi", html_url: "u", user: { login: "bob" } },
      },
      ORG,
    );
    expect(e).toMatchObject({ type: "github.issue-commented", isPullRequest: true, author: "bob" });
  });

  it("maps a merged PR (closed + merged) but not a plain close", () => {
    const merged = mapGithubEvent(
      "pull_request",
      {
        action: "closed",
        repository: repo,
        pull_request: {
          number: 9,
          merged: true,
          title: "T",
          html_url: "u",
          user: { login: "a" },
          merged_by: { login: "m" },
          head: { ref: "f" },
          base: { ref: "main" },
        },
      },
      ORG,
    );
    expect(merged).toMatchObject({
      type: "github.pull-request-merged",
      prNumber: 9,
      mergedBy: "m",
      baseRef: "main",
    });

    const closed = mapGithubEvent(
      "pull_request",
      { action: "closed", repository: repo, pull_request: { number: 9, merged: false } },
      ORG,
    );
    expect(closed).toBeNull();
  });

  it("maps pull_request.opened with draft + branches", () => {
    const e = mapGithubEvent(
      "pull_request",
      {
        action: "opened",
        repository: repo,
        pull_request: {
          number: 2,
          title: "T",
          body: "",
          html_url: "u",
          user: { login: "a" },
          head: { ref: "feat" },
          base: { ref: "main" },
          draft: true,
        },
      },
      ORG,
    );
    expect(e).toMatchObject({
      type: "github.pull-request-opened",
      headRef: "feat",
      baseRef: "main",
      draft: true,
    });
  });

  it("maps a push and derives the short branch", () => {
    const e = mapGithubEvent(
      "push",
      {
        repository: repo,
        ref: "refs/heads/main",
        commits: [{}, {}],
        head_commit: { id: "sha1", message: "msg" },
        pusher: { name: "alice" },
      },
      ORG,
    );
    expect(e).toMatchObject({
      type: "github.push",
      branch: "main",
      commitCount: 2,
      headCommitId: "sha1",
      pusher: "alice",
    });
  });

  it("maps release.published", () => {
    const e = mapGithubEvent(
      "release",
      {
        action: "published",
        repository: repo,
        release: {
          tag_name: "v1",
          name: "One",
          body: "notes",
          html_url: "u",
          prerelease: false,
          author: { login: "a" },
        },
      },
      ORG,
    );
    expect(e).toMatchObject({ type: "github.release-published", tag: "v1", prerelease: false });
  });

  it("returns null for an unmodeled event / action", () => {
    expect(mapGithubEvent("star", { action: "created", repository: repo }, ORG)).toBeNull();
    expect(
      mapGithubEvent("issues", { action: "edited", repository: repo, issue: {} }, ORG),
    ).toBeNull();
  });
});
