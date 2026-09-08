---
description: Start a new isolated worktree with its own reserved ports, then hand back the command to open a session in it.
argument-hint: <name> [--type feat|fix|docs|chore|tooling] [--base <branch>]
allowed-tools: Bash(node .claude/agentkit/cli.mjs:*), Read
---

Create an isolated worktree for: **$ARGUMENTS**

1. Run `node .claude/agentkit/cli.mjs wt new $ARGUMENTS`.
2. Report back, in three lines:
   - the worktree path and branch,
   - the reserved port slot and each service's port,
   - the exact `cd ... && claude` command to open a session there.

Do not start working in the new worktree from this session; this session stays where it is. If the command fails because the name is taken, suggest a free variant rather than deleting anything.
