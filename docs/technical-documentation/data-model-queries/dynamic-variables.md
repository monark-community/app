# Dynamic variables

A value may be a `@variable` ([`query/contracts/query-variables.ts`](../../../packages/query/src/contracts/query-variables.ts)), resolved at **compile time** against a `QueryContext` (`{ userId, now }`) so a saved query means the right thing for whoever runs it, whenever:

- `@me` ; the caller's user id (use on a relation / user field: `assignee:@me`).
- `@now`, `@today`, `@yesterday`, `@tomorrow`, `@startOfWeek`, `@endOfWeek`, `@startOfMonth`, `@endOfMonth`, `@startOfYear`, `@endOfYear` ; UTC date anchors. Compose a relative range with `between`: `due:@startOfWeek..@endOfWeek`.

The AST stores the raw `@token` string (the parser/printer treat it like any value); the compiler swaps it for a concrete bound value via `resolveQueryVariable`, and an unknown or unsupplied-context variable is a 400. The router supplies `{ userId: ctx.userId, now: new Date() }`.
