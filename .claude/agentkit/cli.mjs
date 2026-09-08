#!/usr/bin/env node
// agentkit - parallel-agent workspace CLI.
//
//   node .claude/agentkit/cli.mjs <command>
//
// Or, once `"agent": "node .claude/agentkit/cli.mjs"` is in package.json:
//
//   pnpm agent <command>
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { currentCheckout, loadConfig } from './lib/config.mjs'
import { createPr, whoami } from './lib/github.mjs'
import {
  currentBranch,
  ensureIdentity,
  identityMatches,
  isProtected,
  pushAsAgent,
  repoSlug,
  token,
} from './lib/identity.mjs'
import { list as listSlots, materialize, prune, release, reserve } from './lib/ports.mjs'
import * as wt from './lib/worktree.mjs'
import { c, die, gitOut } from './lib/util.mjs'

const argv = process.argv.slice(2)
const cmd = argv[0] ?? 'help'
const sub = argv[1]

function flag(name, fallback = undefined) {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const cfg = loadConfig(process.cwd())
if (!cfg.__exists && cmd !== 'help') {
  die(`no .claude/agentkit.config.json found above ${process.cwd()}; run the kit's \`init\` first`)
}

const log = (...a) => process.stdout.write(a.join(' ') + '\n')

function showPorts() {
  const here = currentCheckout(cfg, process.cwd())
  const mine = reserve(cfg, here)
  log('')
  log(c.bold(`  slot ${mine.slot}`), c.dim(`(${here.name}${here.isPrimary ? ', primary' : ''})`))
  for (const [name, port] of Object.entries(mine.ports)) {
    log(`    ${name.padEnd(10)} ${c.cyan(String(port))}  ${c.dim(`http://localhost:${port}`)}`)
  }
  log('')
  log(c.dim('  all reserved slots:'))
  for (const entry of listSlots(cfg)) {
    const marker = entry.slot === mine.slot ? c.green('>') : ' '
    const ports = Object.values(entry.ports).join('/')
    const state = entry.alive ? '' : c.yellow(' (gone; prune to free)')
    log(`  ${marker} ${String(entry.slot).padStart(2)}  ${ports.padEnd(12)} ${entry.name}${state}`)
  }
  log('')
}

async function main() {
  switch (cmd) {
    case 'ports': {
      if (sub === 'sync') {
        const here = currentCheckout(cfg, process.cwd())
        const mine = reserve(cfg, here)
        const written = materialize(cfg, mine.ports, here.dir)
        for (const w of written) log(c.green('updated'), w.file, c.dim(w.keys.join(', ')))
        if (!written.length) log(c.dim('env files already match slot ' + mine.slot))
        return
      }
      if (sub === 'prune') {
        const dropped = prune(cfg)
        log(dropped.length ? `freed ${dropped.length} slot(s): ${dropped.map((d) => d.slot).join(', ')}` : 'nothing to prune')
        return
      }
      if (sub === 'release') {
        const target = argv[2] || currentCheckout(cfg, process.cwd()).dir
        const freed = release(cfg, target)
        log(freed ? `released slot ${freed.slot} (${freed.name})` : 'no slot held for that target')
        return
      }
      showPorts()
      return
    }

    case 'wt': {
      if (sub === 'ls' || !sub) {
        const slots = new Map(listSlots(cfg).map((s) => [path.resolve(s.dir).toLowerCase(), s]))
        for (const entry of wt.list(cfg)) {
          const slot = slots.get(path.resolve(entry.dir).toLowerCase())
          const ports = slot ? Object.values(slot.ports).join('/') : c.yellow('no slot')
          log(`  ${String(slot?.slot ?? '?').padStart(2)}  ${ports.padEnd(12)} ${path.basename(entry.dir).padEnd(28)} ${c.dim(entry.branch)}`)
        }
        return
      }
      if (sub === 'new') {
        const name = argv[2]
        if (!name) die('usage: agentkit wt new <name> [--type feat] [--branch <branch>] [--base <branch>]')
        const res = wt.create(cfg, name, {
          type: flag('type'),
          branch: flag('branch'),
          base: flag('base'),
        })
        log(c.green('created'), res.dir)
        log(`  branch ${c.bold(res.branch)} off ${res.base}`)
        log(`  slot ${c.bold(String(res.slot))}: ${Object.entries(res.ports).map(([k, v]) => `${k} ${v}`).join(', ')}`)
        for (const w of res.written) log(c.dim(`  wrote ${w.file} (${w.keys.join(', ')})`))
        log('')
        log(`  ${c.dim('start a session there:')} cd "${res.dir}" && claude`)
        return
      }
      if (sub === 'rm') {
        const name = argv[2]
        if (!name) die('usage: agentkit wt rm <name> [--force] [--delete-branch]')
        const res = wt.remove(cfg, name, {
          force: Boolean(flag('force')),
          deleteBranch: Boolean(flag('delete-branch')),
        })
        log(c.green('removed'), res.dir, res.freed ? c.dim(`(slot ${res.freed.slot} freed)`) : '')
        return
      }
      die(`unknown: wt ${sub}`)
      return
    }

    case 'identity': {
      const cwd = process.cwd()
      if (sub === 'fix') {
        const id = ensureIdentity(cfg, cwd, { scope: flag('scope', cfg.identity?.scope || 'local') })
        log(c.green('set'), `${id.name} <${id.email}>`)
        return
      }
      const id = identityMatches(cfg, cwd)
      log(`  commits as   ${id.ok ? c.green(`${id.name} <${id.email}>`) : c.red(`${id.name} <${id.email || 'unset'}>`)}`)
      if (!id.ok) log(`  expected     ${cfg.identity.email}`)
      const tok = token(cfg)
      log(`  push token   ${tok.ok ? c.green(`${tok.key} present`) : c.red(tok.reason)}`)
      if (tok.ok && flag('remote')) {
        const me = await whoami(cfg)
        log(`  github user  ${c.green(me.login)}`)
      }
      return
    }

    case 'push': {
      const res = pushAsAgent(cfg, process.cwd(), { force: Boolean(flag('force')) })
      if (!res.ok) die(res.reason)
      log(c.green('pushed'), res.branch)
      if (res.stderr) log(c.dim(res.stderr))
      return
    }

    case 'pr': {
      const cwd = process.cwd()
      const branch = currentBranch(cwd)
      const base = flag('base', cfg.worktrees.baseBranch)
      if (isProtected(cfg, branch)) die(`${branch} is protected; PRs are opened from topic branches`)

      const pushed = pushAsAgent(cfg, cwd, { force: Boolean(flag('force')) })
      if (!pushed.ok) die(pushed.reason)
      log(c.green('pushed'), branch)

      const commits = gitOut(['log', '--format=%s', `${base}..HEAD`], cwd).split('\n').filter(Boolean)
      const title = flag('title') || commits.at(-1) || branch
      const bodyFlag = flag('body')
      const body =
        (typeof bodyFlag === 'string' ? bodyFlag : '') ||
        [
          commits.length > 1 ? commits.map((s) => `- ${s}`).join('\n') : commits[0] || '',
          '',
          `Opened by an agent session from worktree \`${path.basename(cwd)}\`.`,
        ].join('\n')

      const repo = repoSlug(cfg, cwd)
      const pr = await createPr(cfg, repo, {
        head: branch,
        base,
        title: String(title),
        body,
        draft: !flag('ready'),
      })
      log(pr.reused ? c.yellow('PR already open') : c.green('PR opened'), pr.html_url)
      log(c.dim(`  as ${pr.user?.login} into ${base}`))
      return
    }

    case 'gate': {
      const checks = cfg.checks ?? []
      if (!checks.length) die('no checks configured; add a `checks` array to .claude/agentkit.config.json')
      for (const check of checks) {
        log(c.dim(`> ${check}`))
        const [bin, ...args] = check.split(' ')
        const res = spawnSync(bin, args, { cwd: cfg.repoRoot, stdio: 'inherit', shell: true })
        if (res.status !== 0) die(`gate failed at: ${check}`, res.status ?? 1)
      }
      log(c.green('gate passed'), c.dim(`(${checks.length} checks)`))
      return
    }

    case 'night': {
      const flagFile = path.join(cfg.registryDirAbs, 'NIGHT')
      if (sub === 'on') {
        fs.mkdirSync(cfg.registryDirAbs, { recursive: true })
        fs.writeFileSync(flagFile, new Date().toISOString() + '\n')
        log(c.green('night mode ON'), c.dim('(guard denies instead of prompting; nothing can hang)'))
        log('')
        log('  launch an unattended session with:')
        log(c.bold('    claude --permission-mode dontAsk'))
        log(c.dim('  then, inside it:  /loop /overnight'))
        return
      }
      if (sub === 'off') {
        fs.rmSync(flagFile, { force: true })
        log('night mode OFF')
        return
      }
      log(fs.existsSync(flagFile) ? c.green('night mode is ON') : 'night mode is off')
      return
    }

    case 'doctor': {
      const problems = []
      const here = currentCheckout(cfg, process.cwd())
      log(c.bold('agentkit doctor'))
      log(`  repo         ${cfg.repoRoot}`)
      log(`  registry     ${cfg.registryDirAbs}`)
      log(`  worktrees    ${cfg.worktreeDirAbs}`)

      const mine = reserve(cfg, here)
      log(`  slot         ${mine.slot} -> ${Object.entries(mine.ports).map(([k, v]) => `${k}:${v}`).join(' ')}`)

      const stale = listSlots(cfg).filter((s) => !s.alive)
      if (stale.length) problems.push(`${stale.length} stale slot(s); run \`agentkit ports prune\``)

      const id = identityMatches(cfg, here.dir)
      if (!id.ok) problems.push(`commit identity is ${id.email || 'unset'}, expected ${cfg.identity.email}; run \`agentkit identity fix\``)

      const tok = token(cfg)
      if (!tok.ok) problems.push(tok.reason)
      else {
        try {
          const me = await whoami(cfg)
          log(`  github       ${me.login}`)
          if (cfg.identity.name && me.login && !cfg.identity.email.includes(me.login)) {
            problems.push(`token belongs to ${me.login}, which does not match identity.email ${cfg.identity.email}`)
          }
        } catch (err) {
          problems.push(`token rejected by GitHub: ${err.message}`)
        }
      }

      const hooks = path.join(cfg.repoRoot, '.claude', 'settings.json')
      if (!fs.existsSync(hooks)) problems.push('.claude/settings.json is missing; the guard and session hooks are not wired up')

      const remote = gitOut(['remote', 'get-url', 'origin'], here.dir)
      if (remote.startsWith('git@')) {
        log(c.dim(`  origin       ${remote} (SSH; agent pushes bypass it via HTTPS + token)`))
      }

      log('')
      if (problems.length) {
        for (const p of problems) log(c.red('  x'), p)
        process.exitCode = 1
      } else {
        log(c.green('  all clear'))
      }
      return
    }

    default:
      log(`agentkit - parallel-agent workspace

  ports                    show this checkout's slot and every reserved slot
  ports sync               rewrite this worktree's env files from its slot
  ports prune              free slots whose worktree is gone
  ports release [target]   hand a slot back

  wt ls                    worktrees with their slots and ports
  wt new <name>            new worktree + branch + reserved ports  [--type --branch --base]
  wt rm <name>             remove a worktree and free its slot     [--force --delete-branch]

  identity                 who this checkout commits as, and whether the token is present
  identity fix             set the machine-account identity here   [--scope local|worktree]
  gate                     run the project's pre-PR checks, stopping at the first failure
  push                     push as the machine account            [--force]
  pr                       push, then open a PR as the machine account  [--title --body --base --ready]

  night on|off|status      unattended mode: the guard denies instead of prompting
  doctor                   check ports, identity, token and hook wiring
`)
  }
}

main().catch((err) => die(err?.message ?? String(err)))
