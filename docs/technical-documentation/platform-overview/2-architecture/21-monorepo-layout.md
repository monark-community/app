# 2.1 Monorepo layout

Two workspace globs (`pnpm-workspace.yaml`): `services/*` and `packages/*`.

- **`services/`** : two thin runnable wiring layers with no business logic:
  - `services/web` ; the Next.js frontend ; imports each module's `/client` + `/contracts`.
  - `services/api` ; the Express + tRPC backend ; imports each module's `/server` + `/contracts`.
- **`packages/`** : the modules. Each exposes exactly three subpath exports and nothing else: **`/server`** (backend), **`/client`** (frontend), **`/contracts`** (shared types, zod, domain events). Workspace package boundaries _are_ the module boundaries.

Support libraries under `packages/` that are not tier-registered feature modules: `common` (event bus, logger, errors, tRPC + http + rate-limit helpers), `db` (Prisma), `query` (MQL), `components`, `shared`, `test-utils`.
