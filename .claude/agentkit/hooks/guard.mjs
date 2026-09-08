#!/usr/bin/env node
// PreToolUse guard.
//
// This is what makes unattended runs possible. Instead of prompting on every
// command, the harness asks this hook, which answers from a policy:
//
//   deny  -> refused, with a reason the agent can read and route around
//   ask   -> normal permission prompt while you are at the keyboard;
//            refused (never hangs) once night mode is on
//   allow -> approved without a prompt
//
// The design assumption is that the *denylist* is the safety property, not the
// prompt. A prompt at 3am is not a control; it is a stalled session. So the
// irreversible things are enumerated and blocked outright, and everything else
// runs.
//
// Fail-open by default: if this hook throws, the session falls back to normal
// prompting rather than bricking. In night mode it fails closed instead, since
// there is nobody to answer a prompt anyway.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../lib/config.mjs'
import { gitOut, readJson } from '../lib/util.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_BASENAME = 'agentkit.config.json'

function decide(decision, reason, extra = {}) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      ...(reason ? { permissionDecisionReason: reason } : {}),
      ...extra,
    },
  }
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
}

const passThrough = () => process.exit(0)

function isNight(cfg) {
  if (process.env.AGENTKIT_NIGHT === '1') return true
  if (process.env.AGENTKIT_NIGHT === '0') return false
  const flags = [
    path.join(cfg.registryDirAbs, 'NIGHT'),
    path.join(cfg.repoRoot, '.claude', 'NIGHT'),
  ]
  return flags.some((f) => fs.existsSync(f))
}

function loadPolicy(cfg) {
  const base = readJson(path.join(HERE, '..', 'policy.json'), null)
  const local = readJson(path.join(cfg.repoRoot, '.claude', 'policy.local.json'), null)
  if (!base && !local) return null
  const merged = { ...(base ?? {}), ...(local ?? {}) }
  for (const key of ['deny', 'ask', 'denyPaths', 'networkWriteAllowHosts']) {
    merged[key] = [...(base?.[key] ?? []), ...(local?.[key] ?? [])]
  }
  return merged
}

/**
 * Split a shell command into its subcommands. Deliberately naive: allow rules
 * require EVERY segment to pass, and deny rules are also tested against the
 * whole string, so a parse this loose can only ever be stricter than reality.
 */
function segments(command) {
  return String(command)
    .split(/\n|&&|\|\||[;|]/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function matchList(list, haystacks) {
  for (const rule of list ?? []) {
    const pattern = typeof rule === 'string' ? rule : rule.pattern
    if (!pattern) continue
    let re
    try {
      re = new RegExp(pattern, 'i')
    } catch {
      continue
    }
    for (const h of haystacks) {
      if (re.test(h)) return typeof rule === 'string' ? { pattern } : rule
    }
  }
  return null
}

/** Any URL in the command whose host is not on the allowlist. */
function foreignHosts(command, allow) {
  const hosts = []
  for (const m of String(command).matchAll(/https?:\/\/([^/\s'"`)]+)/gi)) {
    const host = m[1].replace(/^[^@]*@/, '').split(':')[0].toLowerCase()
    if (!allow.some((a) => host === a || host.endsWith(`.${a}`))) hosts.push(host)
  }
  return [...new Set(hosts)]
}

const WRITE_VERB =
  /(-X\s*(POST|PUT|PATCH|DELETE)|--data\b|--data-raw\b|-d\s|--upload-file\b|-T\s|Invoke-RestMethod|Invoke-WebRequest|-Method\s*(POST|PUT|PATCH|DELETE))/i

function main() {
  let payload
  try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8'))
  } catch {
    passThrough()
  }

  const cwd = payload.cwd || process.cwd()
  const cfg = loadConfig(cwd)
  const night = isNight(cfg)
  const policy = loadPolicy(cfg)

  if (!policy) {
    if (night) decide('deny', 'agentkit: policy.json could not be loaded and night mode is on; refusing rather than running unchecked')
    passThrough()
  }

  const tool = payload.tool_name
  const input = payload.tool_input ?? {}

  // ── File-writing tools ────────────────────────────────────────────────
  if (['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(tool)) {
    const target = input.file_path || input.notebook_path
    if (!target) passThrough()
    const abs = path.resolve(cwd, target)
    const norm = abs.replace(/\\/g, '/')

    // The agent must not be able to edit its own guard, its policy, or the
    // settings that wire them up. Without this, "autonomous" means one
    // creative edit away from unguarded.
    if (process.env.AGENTKIT_ALLOW_SELF_EDIT !== '1') {
      const selfPaths = [
        path.join(cfg.repoRoot, '.claude', 'agentkit'),
        path.join(cfg.repoRoot, '.claude', 'settings.json'),
        path.join(cfg.repoRoot, '.claude', 'policy.local.json'),
        path.join(cfg.repoRoot, '.claude', CONFIG_BASENAME),
      ].map((p) => p.replace(/\\/g, '/').toLowerCase())
      if (selfPaths.some((p) => norm.toLowerCase() === p || norm.toLowerCase().startsWith(p + '/'))) {
        decide(
          'deny',
          'agentkit: the guard, its policy and the settings that wire them are not agent-editable. Ask the operator, or re-run with AGENTKIT_ALLOW_SELF_EDIT=1.',
        )
      }
    }

    const hitPath = matchList(policy.denyPaths, [norm])
    if (hitPath) decide('deny', `agentkit: ${hitPath.reason || `writes to ${target} are blocked by policy`}`)

    const roots = [cfg.repoRoot, cfg.registryDirAbs, os.tmpdir(), cwd]
      .map((p) => path.resolve(p).replace(/\\/g, '/').toLowerCase())
    const inside = roots.some((r) => norm.toLowerCase().startsWith(r))
    if (!inside) {
      if (night) decide('deny', `agentkit: ${abs} is outside the repo, the port registry and the scratchpad; refusing in night mode`)
      decide('request', `agentkit: ${abs} is outside this repo`)
    }
    // Explicit approval, not a pass-through: under `--permission-mode dontAsk`
    // anything not positively allowed is denied, and an unattended lane that
    // cannot write files is not a lane.
    if (autoApproves(policy, night)) decide('allow')
    passThrough()
  }

  // ── Shell tools ───────────────────────────────────────────────────────
  if (!['Bash', 'PowerShell'].includes(tool)) passThrough()
  const command = input.command
  if (!command) passThrough()

  const parts = segments(command)
  const haystacks = [command, ...parts]

  const denied = matchList(policy.deny, haystacks)
  if (denied) decide('deny', `agentkit: ${denied.reason || 'blocked by policy'}`)

  // Credential handling: the machine token is read straight from the
  // environment by `agentkit push` / `agentkit pr`, and by `gh` via a GH_TOKEN
  // you export once. Nothing else has a reason to name it, and a command that
  // names it is one redirect away from printing it into a transcript or
  // posting it somewhere; so naming it at all is refused, which needs no
  // allowlist of destinations to be right.
  const tokenEnv = cfg.identity?.tokenEnv
  const allowHosts = policy.networkWriteAllowHosts ?? []
  const tokenRe = new RegExp('[$%]\\{?' + tokenEnv + '\\b|env:' + tokenEnv + '\\b')
  if (tokenEnv && tokenRe.test(command)) {
    decide(
      'deny',
      `agentkit: do not reference ${tokenEnv} in a command; agentkit reads it from the environment itself, and gh reads GH_TOKEN.`,
    )
  }

  // Outbound writes to hosts nobody vouched for.
  if (WRITE_VERB.test(command)) {
    const strangers = foreignHosts(command, allowHosts)
    if (strangers.length) {
      const reason = `agentkit: outbound write to ${strangers.join(', ')} is not on networkWriteAllowHosts`
      if (night) decide('deny', reason)
      decide('request', reason)
    }
  }

  // Commit identity: catch the mismatch before it reaches a remote, not after.
  if (/\bgit\s+(commit|cherry-pick|revert|am)\b/i.test(command) && cfg.identity?.email) {
    const email = gitOut(['config', 'user.email'], cwd)
    if (email && email.toLowerCase() !== cfg.identity.email.toLowerCase()) {
      decide(
        'deny',
        `agentkit: this checkout commits as ${email}, but agent commits must be ${cfg.identity.email}. Run \`agentkit identity fix\` first.`,
      )
    }
  }

  const asked = matchList(policy.ask, haystacks)
  if (asked) {
    const reason = `agentkit: ${asked.reason || 'this needs a human'}`
    if (night) decide('deny', `${reason} (denied automatically; night mode is on, so nothing is waiting on you)`)
    decide('request', reason)
  }

  if (autoApproves(policy, night)) decide('allow')
  passThrough()
}

function autoApproves(policy, night) {
  const mode = policy.autoApprove ?? 'always'
  return mode === 'always' || (mode === 'night' && night)
}

try {
  main()
} catch (err) {
  process.stderr.write(`agentkit guard: ${err?.message ?? err}\n`)
  process.exit(0) // fail open; a broken guard must not brick the session
}
