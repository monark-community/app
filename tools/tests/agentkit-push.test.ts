import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Regression cover for the push path in `.claude/agentkit/lib/identity.mjs`.
 *
 * That file had shipped two bugs in one day with no test to catch either
 * (`branchAuthors` ranging over the local base branch, and a `--force-with-lease`
 * that could never succeed), and both surfaced only when an agent was blocked
 * by them. The argv construction is pure, so it is cheap to pin ; the git
 * behaviour the fix depends on is pinned against a local bare repo, with no
 * network.
 *
 * The module is vendored JavaScript rather than a workspace package, so it is
 * loaded through a computed specifier: a literal path would make TypeScript
 * resolve a `.mjs` it has no types for.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const IDENTITY = pathToFileURL(join(ROOT, ".claude", "agentkit", "lib", "identity.mjs")).href;

type PushArgs = (opts: { url: string; head: string; force?: boolean; expect?: string }) => string[];
type LeaseExpectation = (cwd: string, head: string) => string;

const mod = (await import(IDENTITY)) as {
  buildPushArgs: PushArgs;
  leaseExpectation: LeaseExpectation;
};
const { buildPushArgs, leaseExpectation } = mod;

const URL_STUB = "https://x-access-token:tok@github.com/acme/repo.git";

describe("buildPushArgs", () => {
  it("leases explicitly on the tracking ref when forcing", () => {
    expect(buildPushArgs({ url: URL_STUB, head: "feat/x", force: true, expect: "abc123" })).toEqual(
      [
        "-c",
        "credential.helper=",
        "push",
        "--force-with-lease=refs/heads/feat/x:abc123",
        URL_STUB,
        "HEAD:refs/heads/feat/x",
      ],
    );
  });

  it("never emits a bare --force-with-lease", () => {
    // The bare form takes its expectation from a named remote's tracking ref.
    // Pushes here go to an anonymous URL precisely so no configured remote (and
    // no credential helper) is involved, so git records no expectation and
    // rejects every forced push with "(stale info)" ; fast-forwards included.
    const args = buildPushArgs({ url: URL_STUB, head: "feat/x", force: true, expect: "abc123" });
    expect(args).not.toContain("--force-with-lease");
  });

  it("never degrades to a plain --force", () => {
    // Several sessions push this repo ; the lease is what stops one clobbering
    // another. Dropping to --force would clear the symptom and remove the guard.
    for (const expected of ["abc123", ""]) {
      const args = buildPushArgs({ url: URL_STUB, head: "feat/x", force: true, expect: expected });
      expect(args).not.toContain("--force");
      expect(args).not.toContain("-f");
    }
  });

  it("adds no lease flag without force", () => {
    expect(buildPushArgs({ url: URL_STUB, head: "topic", expect: "abc123" })).toEqual([
      "-c",
      "credential.helper=",
      "push",
      URL_STUB,
      "HEAD:refs/heads/topic",
    ]);
  });

  it("adds no lease flag when there is nothing to lease against", () => {
    // A branch not yet on the remote: the first push creates it, no force needed.
    const args = buildPushArgs({ url: URL_STUB, head: "brand-new", force: true, expect: "" });
    expect(args.some((a) => a.startsWith("--force"))).toBe(false);
  });

  it("always clears the credential helper", () => {
    // The machine-account guarantee : Git Credential Manager never gets a
    // chance to substitute the operator's cached login for the token in the URL.
    expect(buildPushArgs({ url: URL_STUB, head: "x" }).slice(0, 3)).toEqual([
      "-c",
      "credential.helper=",
      "push",
    ]);
  });
});

describe("lease behaviour against a real repository", () => {
  const root = mkdtempSync(join(tmpdir(), "agentkit-push-"));
  const bare = join(root, "remote.git");
  const work = join(root, "work");

  const git = (args: string[], cwd: string) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const exitOf = (args: string[], cwd: string) => {
    try {
      execFileSync("git", args, { cwd, stdio: "pipe" });
      return 0;
    } catch (err) {
      return (err as { status?: number }).status ?? 1;
    }
  };

  git(["init", "-q", "--bare", bare], root);
  git(["clone", "-q", bare, work], root);
  git(["config", "user.email", "bot@example.test"], work);
  git(["config", "user.name", "Bot"], work);
  writeFileSync(join(work, "f.txt"), "one\n");
  git(["add", "-A"], work);
  git(["commit", "-qm", "one"], work);
  git(["push", "-q", "origin", "HEAD:refs/heads/topic"], work);
  git(["fetch", "-q", "origin"], work);

  const pushWith = (expected: string) =>
    exitOf(
      [
        "push",
        ...buildPushArgs({ url: bare, head: "topic", force: true, expect: expected }).slice(3),
      ],
      work,
    );

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("reads the tracking ref, and reports none for a branch never fetched", () => {
    expect(leaseExpectation(work, "topic")).toBe(
      git(["rev-parse", "refs/remotes/origin/topic"], work),
    );
    expect(leaseExpectation(work, "no-such-branch")).toBe("");
  });

  it("rejects a bare lease over an anonymous URL, even for a fast-forward", () => {
    // If this ever starts passing, git changed and the explicit lease can be
    // revisited. Until then it is the whole reason this code exists.
    appendFileSync(join(work, "f.txt"), "two\n");
    git(["commit", "-qam", "two"], work);
    expect(exitOf(["push", "--force-with-lease", bare, "HEAD:refs/heads/topic"], work)).not.toBe(0);
  });

  it("accepts an explicit lease where the bare form failed", () => {
    expect(pushWith(leaseExpectation(work, "topic"))).toBe(0);
  });

  it("leaves the tracking ref stale, so a second forced push fails until it is recorded", () => {
    // Git only maintains refs/remotes/* for a configured remote. This is why the
    // push path updates it by hand ; without that, --force works exactly once.
    expect(git(["rev-parse", "refs/remotes/origin/topic"], work)).not.toBe(
      git(["rev-parse", "HEAD"], work),
    );

    appendFileSync(join(work, "f.txt"), "three\n");
    git(["commit", "-qam", "three"], work);
    expect(pushWith(leaseExpectation(work, "topic"))).not.toBe(0);

    git(
      ["update-ref", "refs/remotes/origin/topic", git(["rev-parse", "refs/heads/topic"], bare)],
      work,
    );
    expect(pushWith(leaseExpectation(work, "topic"))).toBe(0);
    git(
      ["update-ref", "refs/remotes/origin/topic", git(["rev-parse", "refs/heads/topic"], bare)],
      work,
    );
  });

  it("still refuses to clobber a concurrent push", () => {
    // The property every fix above has to preserve.
    const other = join(root, "other");
    git(["clone", "-q", bare, other], root);
    git(["config", "user.email", "other@example.test"], other);
    git(["config", "user.name", "Other"], other);
    git(["checkout", "-q", "-b", "topic", "origin/topic"], other);
    appendFileSync(join(other, "f.txt"), "theirs\n");
    git(["commit", "-qam", "theirs"], other);
    git(["push", "-q", "origin", "HEAD:refs/heads/topic"], other);

    appendFileSync(join(work, "f.txt"), "mine\n");
    git(["commit", "-qam", "mine"], work);
    expect(pushWith(leaseExpectation(work, "topic"))).not.toBe(0);
  });
});
