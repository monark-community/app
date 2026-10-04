---
type: decision
status: accepted
date: 2026-07-29
---

# 0006. Store integration credentials in one write-only secret store

## Context

Automations and integration modules (social posting, GitHub issues, chat bots) need access tokens for other systems. Without a shared place to keep them, each module would invent its own storage, its own encryption and its own admin screen, and each would be a new place for a token to leak: through an API response, a log line, or a stored run step. The credentials also belong to an organization, not to the deploy, so environment variables don't fit: they are operator-only and set at deploy time.

## Options

| Option                                                   | For                                                                 | Against                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Environment variables                                    | No new code                                                         | Deploy-wide, not per organization; only operators can change them; invisible to flow authors |
| Each module stores its own tokens                        | Each module controls its own shape                                  | Repeated crypto and admin UI; every module is a new leak path to audit                       |
| One shared, encrypted, write-only store per organization | One audited path; one admin screen; modules only read on the server | Values can't be shown to admins; one connection per fixed name; org-wide, not per person     |

## Decision

Add `@monark/secrets`: a per-organization store of named values, encrypted with AES-256-GCM under its own key (`SECRETS_ENCRYPTION_KEY`, separate from the two-factor key). No API procedure ever returns a value. Server code reads a value by name, scoped to the organization it's running for; automation nodes do it through `ctx.getSecret`, and a node's config stores the secret's name, never its value.

The deciding reason is a single, small surface that can't hand a value to the browser, so every new integration inherits the same guarantees instead of re-earning them.

## Consequences

- New integration modules get credential storage, encryption and an admin screen for free, and read values only on the server.
- Flows and stored run steps hold names, so inspecting a run never reveals a token.
- Admins can replace a value but never see it, which is right for credentials and wrong for ordinary settings; those still have no in-app home.
- Any installed node type can read any secret of its organization. That's acceptable because node types are deployed server code.
- Secrets are per organization, not per person, and rotating the encryption key is not supported.
- Outbound webhook signing keeps its own pluggable store, so there are two secret mechanisms to explain to operators.
