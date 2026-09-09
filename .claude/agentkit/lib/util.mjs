// Small shared helpers. Zero dependencies, Node >= 18, cross-platform.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** Git env vars that a parent Claude/hook process can leak into children. */
export const GIT_ENV_POISON = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
]

/**
 * Environment for spawning git (or anything that shells out to git).
 * Inherited GIT_DIR is the classic worktree footgun: it silently retargets
 * every child git call at the wrong repo, which is what makes pre-push hooks
 * hang forever inside a worktree.
 */
export function cleanGitEnv(extra = {}) {
  const env = { ...process.env, ...extra }
  for (const key of GIT_ENV_POISON) delete env[key]
  env.GIT_TERMINAL_PROMPT = '0'
  env.GCM_INTERACTIVE = 'Never'
  return env
}

export function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: false,
    ...opts,
    env: cleanGitEnv(opts.env ?? {}),
  })
  return {
    ok: res.status === 0,
    code: res.status ?? -1,
    stdout: (res.stdout ?? '').trim(),
    stderr: (res.stderr ?? '').trim(),
  }
}

export function git(args, cwd) {
  return run('git', [...LONG_PATHS, ...args], { cwd })
}

/**
 * Windows caps paths at 260 characters unless something opts out, and pnpm's
 * nested `node_modules/.pnpm/<pkg>@<version>_<hash>/...` routinely runs past
 * 290. `git worktree remove` then dies with "Filename too long" partway
 * through deleting the tree. Scoped to each invocation with `-c` rather than
 * relying on a global `core.longpaths`, so the kit works on a machine whose
 * git was never configured for it.
 */
const LONG_PATHS = process.platform === 'win32' ? ['-c', 'core.longpaths=true'] : []

export function gitOut(args, cwd) {
  const r = git(args, cwd)
  return r.ok ? r.stdout : ''
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

/**
 * Directory-based mutex. Good enough for a handful of local processes and it
 * works identically on Windows, macOS and Linux without a native dependency.
 */
export function withLock(lockDir, fn, { tries = 100, waitMs = 25 } = {}) {
  fs.mkdirSync(path.dirname(lockDir), { recursive: true })
  for (let i = 0; i < tries; i++) {
    try {
      fs.mkdirSync(lockDir)
      try {
        return fn()
      } finally {
        try {
          fs.rmSync(lockDir, { recursive: true, force: true })
        } catch {
          /* best effort */
        }
      }
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      // Reclaim a lock whose owner died without cleaning up.
      try {
        const age = Date.now() - fs.statSync(lockDir).mtimeMs
        if (age > 30_000) fs.rmSync(lockDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs)
    }
  }
  throw new Error(`could not acquire lock at ${lockDir}`)
}

/** Upsert `KEY=value` lines in a dotenv file, preserving everything else. */
export function upsertEnv(file, vars) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const changed = []
  for (const [key, value] of Object.entries(vars)) {
    const line = `${key}=${value}`
    const re = new RegExp(`^${escapeRe(key)}=.*$`, 'm')
    if (re.test(text)) {
      const before = text
      text = text.replace(re, line)
      if (before !== text) changed.push(key)
    } else {
      if (text.length && !text.endsWith('\n')) text += '\n'
      text += line + '\n'
      changed.push(key)
    }
  }
  if (changed.length) fs.writeFileSync(file, text, 'utf8')
  return changed
}

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Never let a token reach a log, a transcript or a terminal. */
export function redact(text, ...secrets) {
  let out = String(text ?? '')
  for (const s of secrets) {
    if (s && s.length > 6) out = out.split(s).join('***redacted***')
  }
  return out.replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@')
}

export function die(msg, code = 1) {
  process.stderr.write(`agentkit: ${msg}\n`)
  process.exit(code)
}

export const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
}
