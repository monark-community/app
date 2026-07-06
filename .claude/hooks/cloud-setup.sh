#!/usr/bin/env bash
#
# Cloud environment Setup Script.
#
# This file is the source of truth; paste its contents into
#   claude.ai/code  ->  your environment  ->  Setup Script.
#
# It runs ONCE per environment build and the resulting filesystem is
# snapshot-cached (~7 days), so put the slow, stable stuff here. Fast per-session
# work (DB branch, migrations) lives in .claude/hooks/session-start.sh instead.
set -euo pipefail

# Node / pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Tools the session-start hook needs
if ! command -v jq >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y jq
fi
npm i -g neonctl

# Warm the pnpm store + node_modules so the per-session install is near-instant.
pnpm install --frozen-lockfile

# NOTE: no Supabase / docker here. The database is an ephemeral hosted Neon
# branch, provisioned per session by .claude/hooks/session-start.sh. That keeps
# environment builds light and avoids running the local Supabase stack in-VM.
