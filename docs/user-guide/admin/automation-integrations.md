# Automation integrations

`/admin/automation`. The per-organization connection config for every service your automations trigger on or act through : **GitHub**, **Telegram**, **X (Twitter)**, and **Discord**, one tab each. They live here rather than as top-level destinations because connecting an account is an org-wide, admin-caliber setting, not a place you work day to day.

Each tab is independently gated. A service whose feature flag is off shows a short "this integration is disabled" note naming the flag instead of its form, and a service you lack the `<service>.manage` permission for is read-only. The section as a whole is hidden (and the page 404s) when `automation.enabled` is off.

What you connect here is what an automation's trigger and action nodes can then reach ; the flows themselves are built in [Automations](../automations.md), not here.
