# Monark Platform : System Overview (current state)

A single factual reference for what the Monark platform **is today**. It describes shipped behavior only ; per-feature deep-dives live in their own files under this directory and in each package's `README.md`. Where this doc and a module README disagree, this doc reflects the code as of writing.

Monark is a multi-tenant-capable business-application platform: a typed monorepo whose **core** ships a full substrate (identity, authorization, a runtime-defined polymorphic database, a query language, an event bus, communications, external integrations, and a visual automation engine), and whose **extended** modules add end-user apps (Calendar, Kanban) on top of that substrate without modifying it.

---

## In this section

- **[1. Tech stack](1-tech-stack.md)**
- **[2. Architecture](2-architecture/_index.md)**
- **[3. Core capabilities](3-core-capabilities/_index.md)**
- **[4. Extensions (non-core modules)](4-extensions-non-core-modules.md)**
- **[5. Reference](5-reference.md)**
