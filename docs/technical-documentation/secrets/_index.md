# Secrets store + automation integration

The **secrets substrate** lets any module reach an external system securely: a
per-organization, encrypted-at-rest `key → value` store (`@monark/secrets`), a
server-only read path on the automation node-execution context
(`ctx.getSecret`), and a shared guarded-outbound-HTTP helper
(`@monark/common/http`). It is the enabling primitive for future integration
modules (social posting, GitHub issue creation, etc.) ; those register their own
automation nodes and, from a node's `execute`, read the org's stored access
tokens without any of them ever crossing the tRPC boundary.

## In this section

- **[Pieces](pieces.md)**
- **[Security model](security-model.md)**

## Using a secret from a node

```ts
registerAutomationNodes("github", {
  "create-issue": defineNode({
    descriptor: {
      kind: "action",
      category: "integration",
      label: "Create GitHub issue",
      inputs: [{ id: "in" }],
      outputs: [{ id: "out" }],
      // A `secret` config field: the author picks a secret by NAME.
      configFields: [{ key: "token", label: "GitHub token", type: "secret", required: true }],
    },
    configSchema: z.object({ token: z.string() /* … */ }),
    execute: async (ctx, config) => {
      const token = await ctx.getSecret(config.token); // decrypt on demand
      if (!token) throw new Error("GitHub token secret is not set for this org.");
      const res = await safeFetch("https://api.github.com/repos/…/issues", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          /* … */
        }),
      });
      // Return only non-sensitive result data ; never the token.
      return { status: res.status };
    },
  }),
});
```


## Outbound HTTP guard

`assertOutboundUrlSafe(url)` allows `https://` always, `http://` only in
non-production to loopback / RFC 1918 hosts, and rejects everything else
(throws `ValidationError`). `safeFetch` runs that guard, then issues the request
with an AbortController timeout. **Known limitation:** it is a scheme + host
string check; it does not resolve DNS, so it does not defend against a public
host that resolves to an internal IP (DNS-rebinding SSRF). Resolving the host and
rejecting private IP ranges is a planned hardening.


## Key rotation

v1 uses a single `SECRETS_ENCRYPTION_KEY`. A rotation story (versioned keys +
re-encrypt) is deferred.
