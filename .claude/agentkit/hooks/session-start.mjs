#!/usr/bin/env node
// SessionStart hook.
//
// Reserves this checkout's port slot before the agent does anything, writes
// the ports into the worktree's own env files, and tells the session what its
// ports and identity actually are. Without this the agent guesses "localhost
// :3000" and two worktrees race for the same socket.
import fs from "node:fs";
import { currentCheckout, loadConfig } from "../lib/config.mjs";
import { identityMatches, token } from "../lib/identity.mjs";
import { materialize, reserve } from "../lib/ports.mjs";

function emit(context) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
    }),
  );
}

try {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  const cwd = payload.cwd || process.cwd();
  const cfg = loadConfig(cwd);
  if (!cfg.__exists) process.exit(0);

  const checkout = currentCheckout(cfg, cwd);
  const { slot, ports } = reserve(cfg, checkout);
  materialize(cfg, ports, checkout.dir);

  const lines = [];
  lines.push("## Workspace (agentkit)");
  lines.push("");
  lines.push(
    `- Checkout: \`${checkout.name}\`${checkout.isPrimary ? " (primary)" : " (worktree)"} on branch \`${checkout.branch}\`; integration branch is \`${cfg.worktrees.baseBranch}\`.`,
  );
  lines.push(
    `- **Port slot ${slot}**: ${Object.entries(ports)
      .map(([name, port]) => `${name} \`${port}\``)
      .join(
        ", ",
      )}. These are already written into this worktree's env files; use them in every URL, curl and browser check. Do not assume the default ports; another worktree owns those.`,
  );

  if (cfg.identity?.email) {
    const id = identityMatches(cfg, checkout.dir);
    lines.push(
      id.ok
        ? `- Commit identity: \`${id.name} <${id.email}>\` (machine account), correct.`
        : `- **Commit identity is wrong**: \`${id.email || "unset"}\`, expected \`${cfg.identity.email}\`. Run \`node .claude/agentkit/cli.mjs identity fix\` before committing; commits are blocked until you do.`,
    );
    const tok = token(cfg);
    lines.push(
      tok.ok
        ? `- Push credential: \`${cfg.identity.tokenEnv}\` is present. Ship with \`node .claude/agentkit/cli.mjs pr\`; bare \`git push\` is blocked by policy so nothing can go out as the operator.`
        : `- **${cfg.identity.tokenEnv} is not set in this shell**, so nothing can be pushed. Stop and tell the operator rather than falling back to another identity.`,
    );
  }

  const night =
    process.env.AGENTKIT_NIGHT === "1" ||
    fs.existsSync(`${cfg.registryDirAbs}/NIGHT`) ||
    fs.existsSync(`${cfg.repoRoot}/.claude/NIGHT`);
  if (night) {
    lines.push(
      `- **Night mode is ON.** Nobody is watching. Anything the policy does not allow is refused rather than queued for approval, so never wait on a prompt: if you are blocked, record it in \`${cfg.night.queue}\` and move to the next task.`,
    );
  }

  emit(lines.join("\n"));
} catch (err) {
  process.stderr.write(`agentkit session-start: ${err?.message ?? err}\n`);
  process.exit(0);
}
