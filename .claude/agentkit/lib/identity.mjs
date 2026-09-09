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
  // Prefer the remote tip, for the same reason `worktree.create` does: the
  // local base branch can be stale, or carry commits that never reached the
  // remote. Either way `local..HEAD` includes commits that are not this
  // branch's work, and they get reported as "not authored by the machine
  // account", which reads as a demand to rewrite somebody else's history on a
  // branch that is in fact perfectly clean.
  const remote = gitOut(['rev-parse', '--verify', '--quiet', `origin/${base}`], cwd)
  const range = `${remote ? `origin/${base}` : base}..HEAD`
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
 * What this worktree last saw the remote holding for `head`, or '' if it has
 * never fetched it. This is the lease value for a forced push.
 *
 * Deliberately NOT refreshed here. Fetching immediately before computing the
 * expectation is the classic way to defeat a lease: it folds whatever somebody
 * else just pushed into the value we then authorise overwriting. A stale
 * tracking ref failing the push is the correct outcome; the agent refetches,
 * looks at what arrived, and decides again.
 */
export function leaseExpectation(cwd, head) {
  return gitOut(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${head}`], cwd)
}

/**
 * Build the push argv. Pure, so the part that has been wrong twice is testable
 * without a network or a remote.
 *
 * A bare `--force-with-lease` cannot work here. It derives its expectation from
 * the remote-tracking ref of a NAMED remote, and we push to an anonymous
 * `https://x-access-token:...@host/repo.git` precisely so no configured remote
 * (and no credential helper) is involved. With no remote to derive from, git
 * records no expectation and rejects every forced push with `(stale info)`,
 * even one that is a plain fast-forward. So the expectation is passed
 * explicitly.
 */
export function buildPushArgs({ url, head, force = false, expect = '' }) {
  const args = ['-c', 'credential.helper=', 'push']
  if (force && expect) args.push(`--force-with-lease=refs/heads/${head}:${expect}`)
  args.push(url, `HEAD:refs/heads/${head}`)
  return args
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

  const url = pushUrl(cfg, tok.value)

  let expect = ''
  if (force) {
    expect = leaseExpectation(cwd, head)
    if (!expect) {
      // No tracking ref. Either the branch is not on the remote at all (a first
      // push creates it and needs no force), or this worktree has simply never
      // fetched it. Those need opposite handling, and only the remote can say
      // which it is.
      const onRemote = run('git', ['ls-remote', '--exit-code', '--heads', url, head], { cwd })
      if (onRemote.ok) {
        return {
          ok: false,
          branch: head,
          reason:
            `cannot force-push ${head}: this worktree has no refs/remotes/origin/${head}, so there is nothing to ` +
            `lease against, and forcing without one could discard commits you have never seen. Run ` +
            `\`git fetch origin ${head}\`, look at what it brought back, then re-run.`,
        }
      }
    }
  }

  const res = run('git', buildPushArgs({ url, head, force, expect }), { cwd, env: cleanGitEnv() })

  if (res.ok) {
    // Pushing to an ad-hoc URL does not move refs/remotes/origin/*; git only
    // maintains those for a configured remote. Left alone, our own successful
    // push makes the tracking ref stale, so the NEXT forced push leases against
    // a value the remote has already moved past and fails with the same
    // `(stale info)` this exists to prevent - the fix would work exactly once.
    //
    // Record the commit we just pushed, never whatever the remote holds now:
    // the former is knowledge we earned (the lease proved nobody else had moved
    // the branch), the latter would be a silent fetch of someone else's work.
    const pushed = gitOut(['rev-parse', 'HEAD'], cwd)
    if (pushed) run('git', ['update-ref', `refs/remotes/origin/${head}`, pushed], { cwd })
  }

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
