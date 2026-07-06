#!/usr/bin/env bash
#
# SessionStart bring-up for isolated cloud coding sessions.
#
#   Local sessions : a no-op. Guarded on CLAUDE_CODE_REMOTE so it never touches
#                    your working folder or an in-progress refactor.
#   Cloud sessions : provision an *ephemeral* Neon Postgres branch for THIS
#                    session, point the app at it, run migrations, and print the
#                    scope protocol into Claude's context.
#
# Always exits 0 — a hiccup reports itself into context rather than blocking the
# session. Idempotent: safe to run again on a resumed (re-provisioned) session.

set -uo pipefail

emit_scope() {
  cat <<'MSG'
## Session scope protocol (isolated session)

This is an isolated, single-purpose session on its own git branch and its own
throwaway database. Establish the scope in ONE exchange with the user, then hold it.

1. Before writing code, confirm with the user:
   - Type: bugfix | feature | hotfix | chore
   - Goal: one sentence.
   - Out of scope: what you will explicitly NOT touch.
2. Write it to SCOPE.md at the repo root (template: docs/tooling/SCOPE.template.md).
3. Treat SCOPE.md as a contract. Anything outside it goes under "## Deferred" in
   SCOPE.md instead of getting done. Prefer the smallest change that meets the goal.
4. When the goal is met and the pre-PR gate passes: commit, push the branch, open
   a PR (title "<type>: <goal>"), then STOP. New work is a new session.
MSG
}

# ── Local dev machine: do nothing (keeps this hook off your ongoing local work).
#    Move emit_scope above this guard if you want the scope protocol locally too.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

note() { printf '%s\n' "$*"; }
note "## Cloud session bring-up"

# 1) Dependencies — near-instant if warmed by the Setup Script snapshot.
if command -v pnpm >/dev/null 2>&1; then
  if pnpm install --frozen-lockfile --prefer-offline >/tmp/pnpm.log 2>&1; then
    note "- deps: pnpm install ok"
  else
    note "- deps: pnpm install FAILED (see /tmp/pnpm.log)"
  fi
fi

# 2) Ephemeral Neon Postgres branch for THIS session.
if [ -n "${NEON_API_KEY:-}" ] && [ -n "${NEON_PROJECT_ID:-}" ]; then
  command -v neonctl >/dev/null 2>&1 || npm i -g neonctl >/dev/null 2>&1

  PARENT="${NEON_PARENT_BRANCH:-main}"
  RAW="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo session)"
  # Neon branch name derived from the git branch: lowercase, safe chars, capped.
  DB_BRANCH="cc-$(printf '%s' "$RAW" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-' | cut -c1-48)"

  # Best-effort sweep of ephemeral branches older than 24h. A reclaimed cloud
  # environment fires no teardown hook, so old DB branches are pruned on the way
  # IN rather than out. Requires jq (installed by the Setup Script).
  if command -v jq >/dev/null 2>&1; then
    CUTOFF=$(( $(date +%s) - 86400 ))
    neonctl branches list --project-id "$NEON_PROJECT_ID" -o json 2>/dev/null \
      | jq -r --argjson c "$CUTOFF" \
          '.[]? | select((.name // "") | startswith("cc-"))
                | select(((.created_at // "1970-01-01T00:00:00Z") | fromdateiso8601) < $c)
                | .id' 2>/dev/null \
      | while read -r bid; do
          [ -n "$bid" ] && neonctl branches delete "$bid" --project-id "$NEON_PROJECT_ID" >/dev/null 2>&1 || true
        done
  fi

  # Create this session's branch off the golden parent (no-op if it exists).
  neonctl branches create --project-id "$NEON_PROJECT_ID" --name "$DB_BRANCH" \
    --parent "$PARENT" >/dev/null 2>&1 || true

  POOLED="$(neonctl connection-string "$DB_BRANCH" --project-id "$NEON_PROJECT_ID" --pooled 2>/dev/null || true)"
  DIRECT="$(neonctl connection-string "$DB_BRANCH" --project-id "$NEON_PROJECT_ID" 2>/dev/null || true)"

  if [ -n "$DIRECT" ]; then
    # Persist for the rest of the session (subsequent Bash commands read these),
    # and export for the migrate call right below.
    {
      echo "DATABASE_URL=${POOLED:-$DIRECT}"
      echo "DIRECT_URL=$DIRECT"
    } >> "${CLAUDE_ENV_FILE:-/dev/null}"
    export DATABASE_URL="${POOLED:-$DIRECT}" DIRECT_URL="$DIRECT"
    note "- db: Neon branch '$DB_BRANCH' ready (ephemeral, forked from '$PARENT')"

    if pnpm --filter @monark/db exec prisma migrate deploy >/tmp/migrate.log 2>&1; then
      note "- db: migrations applied"
    else
      note "- db: prisma migrate deploy FAILED (see /tmp/migrate.log)"
    fi
  else
    note "- db: could not obtain a Neon connection string; check NEON_API_KEY / NEON_PROJECT_ID"
  fi
else
  note "- db: NEON_API_KEY / NEON_PROJECT_ID not set — skipping ephemeral DB provisioning"
fi

emit_scope
exit 0
