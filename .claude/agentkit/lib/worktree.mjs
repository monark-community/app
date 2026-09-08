// Worktree lifecycle: create with a reserved port slot, remove and hand the
// slot back. One command so a new parallel task can never start on ports
// another session is already holding.
import fs from "node:fs";
import path from "node:path";
import { currentCheckout } from "./config.mjs";
import { ensureIdentity } from "./identity.mjs";
import { materialize, release, reserve } from "./ports.mjs";
import { cleanGitEnv, git, gitOut, run } from "./util.mjs";

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export function worktreePath(cfg, name) {
  return path.join(cfg.worktreeDirAbs, slug(name));
}

export function create(cfg, name, opts = {}) {
  const base = opts.base || cfg.worktrees.baseBranch;
  const branch = opts.branch || `${opts.type || "feat"}/${slug(name)}`;
  const dir = worktreePath(cfg, name);

  if (fs.existsSync(dir)) throw new Error(`${dir} already exists`);

  // Prefer the remote tip so a new branch never inherits stale local state.
  const remote = gitOut(["rev-parse", "--verify", "--quiet", `origin/${base}`], cfg.primaryRoot);
  const startPoint = remote ? `origin/${base}` : base;

  fs.mkdirSync(cfg.worktreeDirAbs, { recursive: true });
  const add = git(["worktree", "add", dir, "-b", branch, startPoint], cfg.primaryRoot);
  if (!add.ok) throw new Error(`git worktree add failed: ${add.stderr || add.stdout}`);

  if (cfg.identity?.email) ensureIdentity(cfg, dir, { scope: cfg.identity.scope || "local" });

  const checkout = currentCheckout(cfg, dir);
  const slot = reserve(cfg, checkout);
  const written = materialize(cfg, slot.ports, dir);

  const postCreate = [];
  for (const cmd of cfg.worktrees.postCreate ?? []) {
    const [bin, ...args] = cmd.split(" ");
    const res = run(bin, args, { cwd: dir, env: cleanGitEnv(), stdio: "inherit", shell: true });
    postCreate.push({ cmd, ok: res.ok });
    if (!res.ok) break;
  }

  return { dir, branch, base: startPoint, slot: slot.slot, ports: slot.ports, written, postCreate };
}

export function remove(cfg, name, { force = false, deleteBranch = false } = {}) {
  const dir = fs.existsSync(name) ? path.resolve(name) : worktreePath(cfg, name);
  const branch = gitOut(["rev-parse", "--abbrev-ref", "HEAD"], dir);

  // The env files the allocator wrote are untracked by design, so git would
  // refuse every removal without --force and make --force reflexive, which is
  // how real work gets deleted. Ignore exactly those files, and keep refusing
  // when anything else is uncommitted.
  const generated = new Set((cfg.ports.env ?? []).map((e) => e.file.replace(/\\/g, "/")));
  const leftovers = gitOut(["status", "--porcelain"], dir)
    .split("\n")
    .map((l) => l.slice(3).trim().replace(/\\/g, "/"))
    .filter((f) => f && !generated.has(f));

  if (leftovers.length && !force) {
    throw new Error(
      `${path.basename(dir)} still has uncommitted work: ${leftovers.slice(0, 5).join(", ")}${leftovers.length > 5 ? ` (+${leftovers.length - 5} more)` : ""}. Commit it, or pass --force to discard it.`,
    );
  }

  const res = git(["worktree", "remove", "--force", dir], cfg.primaryRoot);
  if (!res.ok) throw new Error(`git worktree remove failed: ${res.stderr || res.stdout}`);

  const freed = release(cfg, dir);
  if (deleteBranch && branch && branch !== "HEAD") {
    git(["branch", force ? "-D" : "-d", branch], cfg.primaryRoot);
  }
  return { dir, branch, freed };
}

export function list(cfg) {
  const out = gitOut(["worktree", "list", "--porcelain"], cfg.primaryRoot);
  const entries = [];
  let current = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { dir: line.slice("worktree ".length).trim(), branch: "" };
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice("branch refs/heads/".length).trim();
    } else if (line.startsWith("detached")) {
      current.branch = "(detached)";
    }
  }
  if (current) entries.push(current);
  return entries;
}
