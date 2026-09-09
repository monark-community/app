# Directory tree

```
app/
├── services/
│   ├── api/             # Express 5 + tRPC v11 host
│   └── web/             # Next.js App Router + Tailwind v4
├── packages/
│   ├── db/              # Prisma schema (base.prisma + assembled fragments) + client
│   ├── common/          # event bus, errors, logger, tRPC primitives, http/rate-limit/crypto
│   ├── query/           # MonarkQL (shared filter AST + text DSL)
│   ├── shared/          # portable utilities
│   ├── components/      # app-specific UI primitives (shadcn via the @monark registry)
│   ├── branding/        # brand config (logo, colours, app name)
│   ├── test-utils/      # integration-test harness (Postgres testcontainer)
│   └── <modules>/       # business modules (@monark/auth, @monark/rbac, …) each with prisma/ fragment when they own tables
├── tools/
│   ├── check-tiers.ts   # extended-to-extended dep guard
│   ├── gen-module.ts    # scaffold a new module package
│   ├── gen-events.ts    # regenerate the DomainEvent union
│   ├── gen-routers.ts   # regenerate the tRPC app-router composition
│   └── gen-schema.ts    # assemble schema.prisma from base + per-module fragments
├── docs/
│   ├── user-guide/              # end-user documentation
│   ├── features-planning/       # shipped specs (by phase) + proposed/
│   ├── technical-documentation/ # developer reference (this folder)
│   ├── agents/                  # conventions for agents/contributors
│   ├── archive/                 # dated point-in-time records (audits, …)
│   └── todo/                    # backlog
├── supabase/                    # Supabase config + email templates
├── modules.manifest.ts          # single source of truth for the module graph
├── render.yaml                  # api + cron deploy blueprint (web deploys on Vercel)
├── turbo.json
├── tsconfig.base.json
├── vitest.shared.ts
├── eslint.config.mjs
├── pnpm-workspace.yaml
└── package.json
```
