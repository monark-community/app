# TODO: Test the GitHub integration against a real repo

The `@monark/github` module ships with unit tests (event mapping, repo parsing) and integration tests (the connection router). What it **cannot** cover in CI is a real end-to-end round-trip: real webhook deliveries from GitHub, and real REST calls from the action nodes (both need a live token + repo + a publicly reachable API URL). This is the manual test plan to run before trusting it in production.

Status: **not yet run.** Owner: —.

## Prerequisites

1. **Enable the flag.** `/admin/feature-flags` → turn on `github.enabled` (for your test org). The `/github` nav entry + page appear.
2. **Test repo.** A GitHub repo you can admin (a throwaway is fine), e.g. `your-org/monark-test`.
3. **Token secret.** Create a fine-grained PAT with **Issues: read+write**, **Pull requests: read+write**, **Contents: read** on the test repo. In `/admin/secrets`, add a secret (e.g. `github-token`) holding it. Nodes reference this secret by name.
4. **Webhook secret + URL.** `/github` → **Generate webhook secret** (copy it — shown once) and copy the **Webhook URL** (`<API_URL>/hooks/github/<orgId>`). The API must be reachable from GitHub — use a tunnel (ngrok/cloudflared) in dev.
5. **Configure the GitHub webhook.** Repo → Settings → Webhooks → Add webhook: Payload URL = the webhook URL, Content type = `application/json`, Secret = the generated secret. Under "Which events", select: Issues, Issue comments, Pull requests, Pull request reviews, Pushes, Releases. Save; GitHub sends a `ping` (expect a 202 in the Recent Deliveries panel).

## A. Inbound webhooks → triggers

For each, build a tiny automation whose **trigger** is the event and whose one action logs/echoes a `{{ trigger.* }}` field (e.g. a Notification or a `github.comment` back), enable it, then perform the GitHub action. Verify a run appears in the automation's run history with the expected trigger fields, and the GitHub delivery shows **202**.

- [ ] **issue-opened** — open an issue → run fires; `trigger.issueNumber`, `trigger.title`, `trigger.author`, `trigger.repo` correct.
- [ ] **issue-commented (issue)** — comment on the issue → fires; `trigger.isPullRequest = false`, `trigger.commentBody` correct.
- [ ] **issue-commented (PR)** — comment on a PR → fires; `trigger.isPullRequest = true`.
- [ ] **pull-request-opened** — open a PR → fires; `trigger.prNumber`, `trigger.headRef`, `trigger.baseRef`, `trigger.draft` correct.
- [ ] **pull-request-merged** — merge a PR → fires; a _closed-without-merge_ PR does **not** fire (close a PR without merging and confirm no run).
- [ ] **pull-request-review-submitted** — submit a review (approve / request changes) → fires; `trigger.state` reflects the review.
- [ ] **push** — push a commit to a branch → fires; `trigger.branch` (short name), `trigger.commitCount`, `trigger.headCommitMessage` correct.
- [ ] **release-published** — publish a release → fires; `trigger.tag`, `trigger.prerelease` correct.

## B. Security / routing (inbound)

- [ ] **Bad signature → 401.** Replay a delivery with a tampered body or wrong secret (GitHub's "Redeliver" after rotating the secret, or a manual `curl` with a bogus `X-Hub-Signature-256`) → 401, no run.
- [ ] **Not connected → 404.** Disconnect on `/github`, send a delivery → 404, no run.
- [ ] **Unknown/unmodeled event → 202 no-op.** Enable e.g. the Star event in GitHub, star the repo → 202, **no** run enqueued (we only translate the 7 modeled types).
- [ ] **Wrong org id in URL → 404** (or no matching connection) — point a webhook at `/hooks/github/<other-org>` and confirm it doesn't cross orgs.

## C. Action nodes (read + write)

Build a manual-trigger automation, add each node, set `token` = your token secret and `repository` = `your-org/monark-test`, run it, and verify on GitHub + in the node's output.

- [ ] **create-issue** — title + body + labels → issue created on GitHub; output `issueNumber` / `url` correct.
- [ ] **get-issue** — a known number → output `title`/`state`/`author` match.
- [ ] **list-issues** — state=open, a label filter, limit=5 → output `count` + `issues[]` correct, respects the limit.
- [ ] **comment** — on the created issue, then on a PR → comment appears; output `commentId`/`url` correct.
- [ ] **add-labels** — comma-separated labels → labels applied; `labelCount` reflects the total.
- [ ] **set-issue-state** — closed, then open → issue state changes on GitHub.
- [ ] **create-pull-request** — head/base branches (create a branch first) + draft toggle → PR created; output `prNumber`/`url` correct.
- [ ] **get-pull-request** — output `merged`/`headRef`/`baseRef`/`state` correct.
- [ ] **request-review** — a valid reviewer login → review requested on the PR.
- [ ] **list-commits** — branch + limit → `count` + `commits[]` (sha/message/author) correct.
- [ ] **search-issues** — a query like `repo:your-org/monark-test is:issue is:open` → `total` + `items[]` correct.

## D. Node error handling

- [ ] **Missing token secret** — clear the `token` field / point at a non-existent secret → node step fails with a clear "token secret not set" message (not a crash).
- [ ] **Bad repository** — `repository = "notarepo"` → clear "expected owner/name" error.
- [ ] **GitHub API error** — e.g. get-issue on a non-existent number → the node step fails carrying GitHub's message + status (e.g. `404: Not Found`).
- [ ] **Token without scope** — a read-only token on a write node → GitHub 403 surfaces on the step, run fails cleanly.

## E. End-to-end scenario

- [ ] **Triage bot.** Trigger `github.issue-opened` → `github.add-labels` (`triage`) → `github.comment` ("Thanks, we'll take a look"). Open an issue and confirm the label + comment land automatically, using `{{ trigger.issueNumber }}` / `{{ trigger.repo }}` in the node configs (exercise the variable picker on GitHub nodes).

## Follow-ups likely to surface

- Rate limiting / secondary-rate-limit handling on the REST calls (currently a plain error).
- GitHub App auth (per-install tokens) as an upgrade from the PAT-via-secret MVP.
- Pagination for list/search beyond the first page (currently single-page, capped at 100).
