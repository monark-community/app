# @monark/shared

Portable utilities that could be published outside this repo. Nothing in here depends on Monark-specific state, framework, or schema; if it does, it belongs elsewhere (`@monark/common` for app-internal runtime, a business module for domain-specific code).

Empty today. Add per-capability modules (for example `src/date.ts`, `src/string.ts`) as concrete needs appear, then re-export them from [`src/index.ts`](src/index.ts).

When something in here becomes broadly useful across Scintillar projects, extract it to a dedicated npm package under `@sntlr/*` rather than letting it solidify as a Monark private.
