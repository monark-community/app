# Layering: injection, not a dependency

The tool executor needs `appRouter`, which lives in `services/api`. Packages must
not import the api service, so `@monark/chat` defines the _contract_ (`tools.ts`:
`ChatToolExecutor`) and the api host injects the concrete executor at boot:

```ts
// services/api/src/server.ts
setChatToolExecutor(buildChatToolset());
```

This mirrors the existing `setWebhookSecretResolver` seam and keeps the dependency
direction clean (`services/api` → packages, never the reverse).
