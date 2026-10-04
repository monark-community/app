---
type: runbook
---

# Turn on the AI assistant

Give users the in-app assistant that answers questions about their data and, after they confirm, makes changes for them. It's off by default. About 10 minutes; it sets an api secret, restarts the api, and turns on two feature flags. How the assistant works: [Chat agent](../concepts/chat-agent.md).

## Before you start

- [ ] An Anthropic API key
- [ ] Access to the api's environment variables
- [ ] Access to the database: the Supabase SQL editor, or `psql` with the `DIRECT_URL`

## Steps

1. On the api, set the key. On Render, add it under `monark-api` → **Environment**; it isn't in the blueprint.
   ```text
   ANTHROPIC_API_KEY=<your-key>
   ```
   Optional: `CHAT_LLM_MODEL` (default `claude-sonnet-4-5-20250929`), `CHAT_LLM_MAX_TOKENS` (default `4096`), and `CHAT_ASSISTANT_NAME` (default `Chrysa`).
2. Restart the api (on Render, saving the variable redeploys it). The key is read on first use, so a missing key shows up only when someone sends a message.
3. Turn on `chat.enabled` (the chat panel and launcher) and `chat.ai-agent` (the AI replies) for the whole deployment. There's no admin page for flags, so write the overrides directly:

   ```sql
   UPDATE "FeatureFlagOverride" SET enabled = true, "setById" = 'operator', "setAt" = now()
   WHERE module = 'chat' AND "flagKey" IN ('enabled', 'ai-agent')
     AND "organizationId" IS NULL AND "userId" IS NULL AND "roleId" IS NULL;

   INSERT INTO "FeatureFlagOverride" (id, module, "flagKey", enabled, "setById", note)
   SELECT gen_random_uuid()::text, 'chat', k, true, 'operator', 'AI assistant turned on'
   FROM (VALUES ('enabled'), ('ai-agent')) AS f(k)
   WHERE NOT EXISTS (
     SELECT 1 FROM "FeatureFlagOverride" o
     WHERE o.module = 'chat' AND o."flagKey" = f.k
       AND o."organizationId" IS NULL AND o."userId" IS NULL AND o."roleId" IS NULL
   );
   ```

   Flags are read on every request, so the change is live at once. The api must have started at least once since the chat module was added, so the flag rows exist. To let each organization name its own assistant, turn on `chat.org-branding` the same way.

4. Give access. Built-in administrators already have it. Other users need a role with the chat **use** permission; see [Administer](../administer/_index.md).

## Verify

Sign in as a user with access. Click the sparkle icon in the top bar (or press Cmd+J / Ctrl+J), and ask "Which data models do we have?". The reply streams in, and a step card for looking up your data models completes.

## Turn it off

Set `chat.ai-agent` back to off. The assistant stops replying immediately; conversations stay stored.

```sql
UPDATE "FeatureFlagOverride" SET enabled = false, "setAt" = now()
WHERE module = 'chat' AND "flagKey" = 'ai-agent'
  AND "organizationId" IS NULL AND "userId" IS NULL AND "roleId" IS NULL;
```

## If something goes wrong

| Symptom                                        | Cause                                                                                     | Fix                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| No sparkle icon in the top bar                 | `chat.enabled` is off for that user                                                       | Check the override from step 3.                        |
| Sending a message fails with a not-found error | `chat.ai-agent` is off                                                                    | Turn it on.                                            |
| `503` with `chat_llm_not_configured`           | `ANTHROPIC_API_KEY` unset, or `CHAT_LLM_PROVIDER` isn't `anthropic`                       | Set the key, clear the provider, restart the api.      |
| An Anthropic error in the reply or the api log | invalid key or model id                                                                   | Check the key and `CHAT_LLM_MODEL`.                    |
| `503` with `chat_tools_not_wired`              | the api build didn't register the assistant's tools                                       | Redeploy from a clean build; report it if it persists. |
| The assistant says it can't do something       | the user's role lacks that permission; the assistant acts with the user's own permissions | Grant the permission, or ask an administrator.         |
| The `INSERT` fails with a foreign-key error    | flag rows not synced yet                                                                  | Start the api once, then rerun step 3.                 |

Next: [Choose a webhook secret store](choose-a-webhook-secret-store.md)
