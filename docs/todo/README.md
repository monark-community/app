# Todo backlog

A persistent place for follow-up suggestions Claude (or anyone else) raises during active work but that aren't urgent enough to land in the same session. The user can ask Claude to "pick something off `docs/todo`" during downtime ; that's the contract.

## What lives here

- **Suggestions raised but not implemented.** When Claude points out "X would be nice to fix later" during a feature, the suggestion lands in [`backlog.md`](backlog.md) instead of vanishing into the chat scrollback.
- **Audit findings** that don't have an immediate owner.
- **Refactors / hardening** that are scoped enough to do alone but big enough not to bundle into an unrelated PR.

## What does NOT live here

- **In-flight work for the current session.** Use the conversation's TodoWrite list for that.
- **Long-form planning** (those go under `docs/features-planning/`).
- **Bugs that block the user right now.** Those get fixed immediately, not queued.
- **Dependency-on-something-future items** ("when feature X ships, ..."). Capture those as `## Out of scope` in the relevant feature spec instead.

## Format

`backlog.md` is a single file with H2 sections per category and one checkbox bullet per item. Each item is one short paragraph that captures :

1. **What** to do (one sentence).
2. **Why** (the trade-off the original session decided not to do it now).
3. **Where** (file paths so the next session doesn't have to rediscover the surface).

Optional date prefix `[YYYY-MM-DD]` when the item was raised. Items are deleted when done — the CHANGELOG carries the history, the backlog stays focused on what's still open.

## Workflow

When the user says "pick something from the todo backlog" :

1. Open `backlog.md`, pick one item, mention which one to the user before starting.
2. Implement it as a normal task (TodoWrite for active steps, etc.).
3. Strike it from `backlog.md` (delete the bullet) as part of the change.
4. Add a CHANGELOG entry per usual.

When raising a new suggestion mid-session that the user explicitly defers :

1. Tell the user it's going on the backlog before continuing.
2. Append a new bullet to the appropriate `backlog.md` section.
