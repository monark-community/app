---
description: Run the pre-PR gate, commit what is left, push as the machine account, and open a draft PR.
argument-hint: [PR title]
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

Ship the work in this worktree. Follow these steps in order and stop at the first one that fails.

1. **Check where you are.** `git status --short` and `git rev-parse --abbrev-ref HEAD`. If the branch is protected (see `protectedBranches` in `.claude/agentkit.config.json`), stop and say so; the work needs a topic branch first.

2. **Gate.** `node .claude/agentkit/cli.mjs gate`. If it fails, fix the failures and run it again. Do not skip a check, do not weaken a check to make it pass, and do not push a red tree; a failing gate is the finding, and reporting it honestly is a valid outcome for this command.

3. **Commit.** Stage the work and commit in coherent increments, not one giant commit. Conventional-commit subjects. Never `--no-verify`.

4. **Push and open the PR.** `node .claude/agentkit/cli.mjs pr` (add `--title "$ARGUMENTS"` when an argument was given, and `--ready` only if the user asked for a non-draft PR).

   Do not run `git push` yourself; it is blocked on purpose. The `pr` command is what pushes over HTTPS with the machine-account token, so the commits and the PR both land as the machine account rather than the operator.

5. **Report** the PR URL, the branch, and anything you deliberately left out of scope.

If the machine-account token is missing from the environment, stop at step 4 and say so plainly. Do not fall back to another identity, another remote, or an unauthenticated push to make progress.
