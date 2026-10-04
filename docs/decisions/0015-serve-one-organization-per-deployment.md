---
type: decision
status: accepted
date: 2026-09-08
---

# 0015. Serve one organization per deployment

## Context

Monark carried two tenancy modes. A `tenancy.multi-tenant` flag, off by default, kept a second set of code paths alive: organization pickers in the roles, webhooks and invite screens, branches in bootstrap and membership, and a provisioning refusal for multi-tenant installs. No deployment used it. Meanwhile the way Monark actually served several businesses was already to run several instances, each with its own database, domain and branding, from the same API image and a different environment file.

## Options

| Option                                              | For                                                                                | Against                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Keep both modes behind the flag                     | Multi-tenancy stays available if a customer ever needs it                          | Two code paths and two admin UIs to maintain and test, one of them never exercised                       |
| Commit to multi-tenancy                             | One deployment serves everyone; cheaper to host many small customers               | Every query, registry, secret and brand setting must be tenant-scoped; data isolation is harder to prove |
| Commit to single tenancy, one instance per business | One code path; isolation by separate databases; per-customer branding and upgrades | More instances to run; no cross-organization features                                                    |

## Decision

Monark is single-tenant. The flag, its second code paths and the organization pickers were removed. Each deployment provisions exactly one organization at first boot from `INITIAL_ORG_*` environment variables, and every user joins it on sign-up or sign-in. Serving another business means running another instance.

The deciding reason: the multi-tenant mode had no users and doubled the surface to maintain, while separate instances give stronger isolation with no extra code.

## Consequences

- Code can assume a single organization; there's no organization switcher.
- Isolation between businesses comes from separate databases and deployments, not from query scoping.
- Operators run and upgrade one instance per business, from the same image.
- The distinction between platform-level and organization-level webhooks remains, as a permission tier rather than a tenancy one.
