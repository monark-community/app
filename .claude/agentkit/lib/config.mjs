// Config discovery + defaults.
//
// The config lives at <repo>/.claude/agentkit.config.json. Everything else in
// the kit resolves against it, so a project only ever declares its own shape
// (which services, which ports, which machine account) in one place.
import fs from "node:fs";
import path from "node:path";
import { gitOut, readJson } from "./util.mjs";

export const CONFIG_NAME = "agentkit.config.json";

export const DEFAULTS = {
  // Where the cross-worktree port registry lives. Relative to the repo root.
  // It must sit OUTSIDE every worktree so all of them read the same file.
  registryDir: "../.agentkit",
  worktrees: {
    dir: "../worktrees",
    baseBranch: "main",
    branchPrefixes: ["feat", "fix", "docs", "test", "chore", "refactor", "tooling"],
  },
  protectedBranches: ["main", "master"],
  ports: {
    stride: 10,
    maxSlots: 40,
    // name -> base port. Slot N gets base + N * stride.
    services: { web: 3000, api: 4000 },
    // Files the allocator materializes inside each worktree.
    env: [],
    // file -> template to seed from when the file does not exist yet.
    seedFrom: {},
  },
  identity: {
    name: "",
    email: "",
    tokenEnv: "",
    repo: "",
    host: "github.com",
  },
  // The pre-PR gate, in order. `agentkit gate` runs these and stops at the
  // first failure, so "is this shippable?" has one answer everywhere.
  checks: [],
  night: { queue: "AGENT-QUEUE.md", maxParallel: 3, logDir: "../.agentkit/logs" },
};

function deepMerge(base, override) {
  if (Array.isArray(override)) return override;
  if (override === null || typeof override !== "object") return override ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] =
      k in base && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])
        ? deepMerge(base[k], v)
        : v;
  }
  return out;
}

/** Walk up from `start` until a .claude/agentkit.config.json shows up. */
export function findRepoRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".claude", CONFIG_NAME))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to the git worktree root so `agentkit init` works pre-config.
  const top = gitOut(["rev-parse", "--show-toplevel"], start);
  return top ? path.resolve(top) : path.resolve(start);
}

/**
 * The primary checkout, i.e. the one holding the real `.git`. Worktrees sit
 * somewhere else entirely, so anything that must be shared between them
 * (the port registry, the worktree directory) has to be resolved against this
 * and never against the current working tree.
 */
export function primaryRoot(start = process.cwd()) {
  const common = gitOut(["rev-parse", "--path-format=absolute", "--git-common-dir"], start);
  if (common) return path.dirname(path.resolve(common));
  return findRepoRoot(start);
}

export function loadConfig(start = process.cwd()) {
  const repoRoot = findRepoRoot(start);
  const file = path.join(repoRoot, ".claude", CONFIG_NAME);
  const raw = readJson(file, null);
  const cfg = deepMerge(DEFAULTS, raw ?? {});
  cfg.__file = file;
  cfg.__exists = raw !== null;
  cfg.repoRoot = repoRoot;
  cfg.primaryRoot = primaryRoot(repoRoot);
  // Shared state resolves against the primary checkout so every worktree
  // lands on the same registry file and the same worktree directory.
  cfg.registryDirAbs = path.resolve(cfg.primaryRoot, cfg.registryDir);
  cfg.worktreeDirAbs = path.resolve(cfg.primaryRoot, cfg.worktrees.dir);
  return cfg;
}

/**
 * The checkout we are standing in, and whether it is the primary one.
 * The primary checkout always holds slot 0 so its ports never move.
 */
export function currentCheckout(cfg, cwd = process.cwd()) {
  const top = gitOut(["rev-parse", "--show-toplevel"], cwd);
  const dir = top ? path.resolve(top) : path.resolve(cwd);
  const common = gitOut(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  const primary = common ? path.dirname(path.resolve(common)) : dir;
  return {
    dir,
    name: path.basename(dir),
    isPrimary: path.resolve(dir) === path.resolve(primary),
    branch: gitOut(["rev-parse", "--abbrev-ref", "HEAD"], cwd) || "(detached)",
  };
}
