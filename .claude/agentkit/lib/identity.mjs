// Git identity + push safety.
//
// The whole point: an agent shell must be physically unable to act as the
// human's GitHub account. Three independent locks do that:
//   1. commit identity  - user.name/user.email are the machine account's
//   2. push credential  - pushes go over HTTPS with the machine token, with
//                         the OS credential helper explicitly disabled so
//                         Git Credential Manager can never supply your login
//   3. branch policy    - protected branches are refused outright
import { cleanGitEnv, git, gitOut, redact, run } from './util.mjs'

export function readIdentity(cwd) {
  return {
    name: gitOut(['config', 'user.name'], cwd),
    email: gitOut(['config', 'user.email'], cwd),
  }
}

export function identityMatches(cfg, cwd) {
  const want = cfg.identity ?? {}
  if (!want.email) return { ok: true, skipped: true, ...readIdentity(cwd) }
  const have = readIdentity(cwd)
  return {
    ok: have.email.toLowerCase() === want.email.toLowerCase(),
    ...have,
    want,
  }
}

export function ensureIdentity(cfg, cwd, { scope = 'local' } = {}) {
  const want = cfg.identity ?? {}
  if (!want.email || !want.name) throw new Error('identity.name / identity.email are not set in agentkit.config.json')
  if (scope === 'worktree') {
    git(['config', 'extensions.worktreeConfig', 'true'], cwd)
  }
  const flag = scope === 'worktree' ? '--worktree' : '--local'
  git(['config', flag, 'user.name', want.name], cwd)
  git(['config', flag, 'user.email', want.email], cwd)
  return readIdentity(cwd)
}

export function token(cfg) {
  const key = cfg.identity?.tokenEnv
  if (!key) return { ok: false, reason: 'identity.tokenEnv is not set in agentkit.config.json' }
  const value = process.env[key]
  if (!value) return { ok: false, reason: `${key} is not set in this shell` }
  return { ok: true, key, value }
}

export function isProtected(cfg, branch) {
  return (cfg.protectedBranches ?? []).some((p) => {
    if (p.endsWith('/*')) return branch.startsWith(p.slice(0, -1))
    return p === branch
  })
}

export function currentBranch(cwd) {
  return gitOut(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
}

/** Authors of the commits this branch adds on top of the base branch. */
export function branchAuthors(cfg, cwd, base = cfg.worktrees.baseBranch) {
  const range = `${base}..HEAD`
  const out = gitOut(['log', '--format=%ae', range], cwd)
  return [...new Set(out.split('\n').map((s) => s.trim()).filter(Boolean))]
}

export function pushUrl(cfg, tok) {
  const host = cfg.identity?.host || 'github.com'
  const repo = cfg.identity?.repo
  if (!repo) throw new Error('identity.repo is not set in agentkit.config.json')
  return `https://x-access-token:${tok}@${host}/${repo}.git`
}

/**
 * Push HEAD to `branch` as the machine account.
 *
 * `-c credential.helper=` with an empty value clears the helper chain for this
 * one invocation, so Git Credential Manager (installed alongside GitHub
 * Desktop on most Windows boxes) never gets a chance to hand over the human's
 * cached credentials. The token in the URL is the only credential in play, and
 * it never lands in .git/config because we never touch the remote.
 */
export function pushAsAgent(cfg, cwd, { branch, force = false } = {}) {
  const tok = token(cfg)
  if (!tok.ok) return { ok: false, reason: tok.reason }

  const head = branch || currentBranch(cwd)
  if (!head || head === 'HEAD') return { ok: false, reason: 'detached HEAD; check out a branch first' }
  if (isProtected(cfg, head)) return { ok: false, reason: `${head} is a protected branch; push a topic branch and open a PR` }

  const id = identityMatches(cfg, cwd)
  if (!id.ok) {
    return {
      ok: false,
      reason: `commit identity is ${id.email || '(unset)'}, expected ${id.want.email}; run \`agentkit identity fix\``,
    }
  }

  const strangers = branchAuthors(cfg, cwd).filter(
    (e) => e.toLowerCase() !== cfg.identity.email.toLowerCase(),
  )
  if (strangers.length) {
    return {
      ok: false,
      reason: `these commits are not authored by the machine account: ${strangers.join(', ')}; rewrite them or push manually`,
    }
  }

  const args = ['-c', 'credential.helper=', 'push']
  if (force) args.push('--force-with-lease')
  args.push(pushUrl(cfg, tok.value), `HEAD:refs/heads/${head}`)

  const res = run('git', args, { cwd, env: cleanGitEnv() })
  return {
    ok: res.ok,
    branch: head,
    stdout: redact(res.stdout, tok.value),
    stderr: redact(res.stderr, tok.value),
    reason: res.ok ? null : redact(res.stderr || res.stdout, tok.value),
  }
}

export function repoSlug(cfg, cwd) {
  if (cfg.identity?.repo) return cfg.identity.repo
  const url = gitOut(['remote', 'get-url', 'origin'], cwd)
  const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/)
  return m ? m[1] : ''
}
