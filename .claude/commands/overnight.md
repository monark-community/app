---
description: Drain the agent queue unattended - one worktree and one draft PR per task, with no prompts to answer.
allowed-tools: Bash, Read, Edit, Write, Glob, Grep
---

You are the overnight orchestrator. Run this from the primary checkout. One invocation is one pass; a `/loop` around this command is what makes it run all night.

**The rule that matters: never wait on a human.** Nobody is awake. If something needs a decision you cannot make, write the question into the queue file and move to the next task. Do not ask, do not idle, do not stop the loop over one bad task.

## Pass

**1. Reap.** For every task marked `[~]` in the queue file (`night.queue` in `.claude/agentkit.config.json`), check whether its lane finished: read the tail of its log file, and check whether its branch has an open PR. Then rewrite the line:

- shipped, PR open → `[x]` plus the PR URL
- finished, no PR → `[!]` plus one line on what stopped it
- still running → leave `[~]`
- log shows the guard refused something → `[!]` plus the exact `agentkit:` reason, so the operator can widen the policy in the morning

Free the ports of any worktree that finished and was removed: `node .claude/agentkit/cli.mjs ports prune`.

**2. Fill.** Count the lanes still `[~]`. While that count is below `night.maxParallel`, take the topmost `[ ]` task and start it:

```
node .claude/agentkit/cli.mjs wt new <slug> --type <feat|fix|docs|chore|tooling>
```

Then launch a headless session in that worktree, in the background:

```
cd "<worktree dir>" && AGENTKIT_NIGHT=1 claude -p "<task brief>" --permission-mode dontAsk > "<logDir>/<slug>.log" 2>&1
```

Mark the queue line `[~]` with the slug, the branch, and the log path, so the next pass can reap it.

The task brief you pass to the headless session should be self-contained: what to build, what done looks like, and the instruction to finish with `/ship`. It cannot ask you anything once it starts, so anything ambiguous must be resolved into an explicit assumption in the brief, and the assumption stated in the PR body.

**3. Report.** Two or three lines: what you reaped, what you started, how many lanes are running, and how many tasks remain. If the queue is empty and no lane is running, say so and stop the loop.

## Queue format

```markdown
- [ ] feat add GitHub OAuth sign-in
      done: a user can sign in with GitHub and land on /dashboard; covered by a test
- [~] fix flaky calendar drag test (lane: flaky-calendar, branch: fix/flaky-calendar, log: ../.agentkit/logs/flaky-calendar.log)
- [x] docs module README sweep https://github.com/<org>/<repo>/pull/123
- [!] chore bump node to 22 blocked: needs a decision on dropping Node 20 in CI
```

Statuses: `[ ]` waiting, `[~]` running, `[x]` shipped, `[!]` blocked or failed. Only ever move a task forward; never delete a line, and never re-run a task already marked `[x]`.

## Standing constraints

- Every task gets its own worktree and its own branch. Never two lanes in one checkout.
- Never push with `git push`; the lanes ship through `/ship`, which uses the machine account.
- Never touch a protected branch.
- If the queue file does not exist, create it from the format above with an empty list and stop; there is nothing to do until the operator fills it.
