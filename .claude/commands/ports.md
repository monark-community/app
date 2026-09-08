---
description: Show this worktree's reserved port slot, every other slot in use, and re-sync the env files.
allowed-tools: Bash(node .claude/agentkit/cli.mjs:*), Read
---

Run `node .claude/agentkit/cli.mjs ports`, then `node .claude/agentkit/cli.mjs ports sync`.

Report this worktree's ports and the URLs to use. If any slot is marked gone, say that `ports prune` would free it; do not run it unless asked.

From here on in this session, use these ports in every URL, curl, browser check and screenshot. The default ports belong to a different worktree.
