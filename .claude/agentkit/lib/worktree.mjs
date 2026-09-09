// Worktree lifecycle: create with a reserved port slot, remove and hand the
// slot back. One command so a new parallel task can never start on ports
// another session is already holding.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { currentCheckout } from './config.mjs'
import { ensureIdentity } from './identity.mjs'
import { materialize, release, reserve } from './ports.mjs'
import { cleanGitEnv, git, gitOut, run } from './util.mjs'

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

export function worktreePath(cfg, name) {
  return path.join(cfg.worktreeDirAbs, slug(name))
}

export function create(cfg, name, opts = {}) {
  const base = opts.base || cfg.worktrees.baseBranch
  const branch = opts.branch || `${opts.type || 'feat'}/${slug(name)}`
  const dir = worktreePath(cfg, name)

  if (fs.existsSync(dir)) throw new Error(`${dir} already exists`)

  // Prefer the remote tip so a new branch never inherits stale local state.
  const remote = gitOut(['rev-parse', '--verify', '--quiet', `origin/${base}`], cfg.primaryRoot)
  const startPoint = remote ? `origin/${base}` : base

  fs.mkdirSync(cfg.worktreeDirAbs, { recursive: true })
  const add = git(['worktree', 'add', dir, '-b', branch, startPoint], cfg.primaryRoot)
  if (!add.ok) throw new Error(`git worktree add failed: ${add.stderr || add.stdout}`)

  if (cfg.identity?.email) ensureIdentity(cfg, dir, { scope: cfg.identity.scope || 'local' })

  const checkout = currentCheckout(cfg, dir)
  const slot = reserve(cfg, checkout)
  const written = materialize(cfg, slot.ports, dir)

  const postCreate = []
  for (const cmd of cfg.worktrees.postCreate ?? []) {
    const [bin, ...args] = cmd.split(' ')
    const res = run(bin, args, { cwd: dir, env: cleanGitEnv(), stdio: 'inherit', shell: true })
    postCreate.push({ cmd, ok: res.ok })
    if (!res.ok) break
  }

  return { dir, branch, base: startPoint, slot: slot.slot, ports: slot.ports, written, postCreate }
}

/**
 * Delete a directory tree that git could not.
 *
 * On Windows neither `fs.rmSync` nor PowerShell's `Remove-Item` reliably
 * clears a pnpm `node_modules`: the `.pnpm/<pkg>@<ver>_<hash>/...` paths run
 * past 290 characters and both give up partway, even through the `\\?\`
 * device path. `robocopy` mirroring an empty directory onto the target is not
 * subject to MAX_PATH and does clear it, so it is the fallback of last resort.
 */
function forceRemoveTree(dir) {
  const native = process.platform === 'win32' ? `\\\\?\\${dir}` : dir
  try {
    fs.rmSync(native, { recursive: true, force: true, maxRetries: 5 })
  } catch {
    /* fall through to robocopy */
  }
  if (!fs.existsSync(dir)) return true

  if (process.platform === 'win32') {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'agentkit-empty-'))
    // Exit codes 0-7 are all success for robocopy, so the result is judged by
    // what is left on disk rather than by the status code.
    run('robocopy', [empty, dir, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NC', '/NS'])
    fs.rmSync(empty, { recursive: true, force: true })
    try {
      fs.rmdirSync(dir)
    } catch {
      /* judged below */
    }
  }
  return !fs.existsSync(dir)
}

export function remove(cfg, name, { force = false, deleteBranch = false } = {}) {
  const dir = fs.existsSync(name) ? path.resolve(name) : worktreePath(cfg, name)
  const registered = list(cfg).some(
    (e) => path.resolve(e.dir).toLowerCase() === path.resolve(dir).toLowerCase(),
  )

  if (!registered && !fs.existsSync(dir)) {
    // Nothing on disk and nothing in git: only the port slot can still be held.
    const freed = release(cfg, dir)
    return { dir, branch: '', freed, orphan: false }
  }

  const branch = registered ? gitOut(['rev-parse', '--abbrev-ref', 'HEAD'], dir) : ''

  if (registered) {
    // The env files the allocator wrote are untracked by design, so git would
    // refuse every removal without --force and make --force reflexive, which
    // is how real work gets deleted. Ignore exactly those, and keep refusing
    // when anything else is uncommitted.
    const generated = new Set((cfg.ports.env ?? []).map((e) => e.file.replace(/\\/g, '/')))
    const leftovers = gitOut(['status', '--porcelain'], dir)
      .split('\n')
      .map((l) => l.slice(3).trim().replace(/\\/g, '/'))
      .filter((f) => f && !generated.has(f))

    if (leftovers.length && !force) {
      throw new Error(
        `${path.basename(dir)} still has uncommitted work: ${leftovers.slice(0, 5).join(', ')}${leftovers.length > 5 ? ` (+${leftovers.length - 5} more)` : ''}. Commit it, or pass --force to discard it.`,
      )
    }

    git(['worktree', 'remove', '--force', dir], cfg.primaryRoot)
  }

  // Whatever git managed or refused, the directory has to go. A half-finished
  // `worktree remove` deregisters the worktree and then dies on a long path,
  // leaving a tree that `git worktree remove` will no longer touch ("is not a
  // working tree") and that nothing else cleans up. Own that state here.
  const orphan = !registered && fs.existsSync(dir)
  if (fs.existsSync(dir) && !forceRemoveTree(dir)) {
    throw new Error(
      `could not delete ${dir}. Something is holding a file open (a dev server, an editor, a shell sitting in it); close it and re-run.`,
    )
  }

  git(['worktree', 'prune'], cfg.primaryRoot)
  const freed = release(cfg, dir)
  if (deleteBranch && branch && branch !== 'HEAD') {
    git(['branch', force ? '-D' : '-d', branch], cfg.primaryRoot)
  }
  return { dir, branch, freed, orphan }
}

export function list(cfg) {
  const out = gitOut(['worktree', 'list', '--porcelain'], cfg.primaryRoot)
  const entries = []
  let current = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current)
      current = { dir: line.slice('worktree '.length).trim(), branch: '' }
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch refs/heads/'.length).trim()
    } else if (line.startsWith('detached')) {
      current.branch = '(detached)'
    }
  }
  if (current) entries.push(current)
  return entries
}
