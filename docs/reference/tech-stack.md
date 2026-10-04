---
type: reference
---

# Tech stack

The languages, frameworks and services Monark is built on, with the major version in use. Versions come from the workspace `package.json` files.

<!-- source: package.json, services/web/package.json, services/api/package.json, packages/*/package.json -->

## Platform and tooling

| Layer        | Technology                                                                                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language     | TypeScript 5, ESM, with full `strict` plus `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`; `moduleResolution: Bundler` |
| Runtime      | Node.js 22 or later                                                                                                                                                                 |
| Monorepo     | pnpm 10 workspaces (`services/*`, `packages/*`), Turborepo 2                                                                                                                        |
| Validation   | zod at every boundary: tRPC input, request bodies, environment                                                                                                                      |
| Lint, format | ESLint with typescript-eslint, Prettier, lint-staged on commit                                                                                                                      |
| CI           | GitHub Actions                                                                                                                                                                      |

## Frontend (`services/web`)

| Concern               | Technology                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework             | Next.js 15 (App Router), React 19                                                                                                           |
| Styling               | Tailwind CSS 4                                                                                                                              |
| UI primitives         | Radix UI, shadcn-style components, `class-variance-authority`, `lucide-react` icons, `next-themes`, `sonner` toasts, `cmdk` command palette |
| Data fetching         | tRPC 11 client with TanStack Query 5                                                                                                        |
| Tables, drag and drop | TanStack Table 8, `@dnd-kit`                                                                                                                |
| Forms                 | react-hook-form with zod resolvers                                                                                                          |
| Rich text             | Tiptap 3 (rich-text fields), BlockNote (block documents)                                                                                    |
| Flow editor           | React Flow (`@xyflow/react`)                                                                                                                |
| Translations          | next-intl, English and French, kept at parity by `pnpm check:i18n`                                                                          |
| Error tracking        | Sentry                                                                                                                                      |

## Backend (`services/api`)

| Concern        | Technology                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| HTTP server    | Express 5                                                                      |
| API            | tRPC 11 (Express adapter); a REST API under `/api/v1` with an OpenAPI document |
| Logging        | pino, `pino-http`                                                              |
| Error tracking | Sentry                                                                         |
| AI assistant   | Anthropic SDK                                                                  |
| Email          | nodemailer over SMTP                                                           |

## Data and services

| Concern  | Technology                                                                      |
| -------- | ------------------------------------------------------------------------------- |
| Database | PostgreSQL, accessed through Prisma 6                                           |
| Auth     | Supabase Auth for sessions, with a `User` table in Monark's own schema          |
| Storage  | Supabase Storage, private buckets, through the Files module's storage interface |

## Testing

| Layer             | Technology                                                            |
| ----------------- | --------------------------------------------------------------------- |
| Unit, integration | Vitest 3; integration suites run against PostgreSQL in Testcontainers |
| Component         | Vitest with MSW for network mocking                                   |
| End to end        | Playwright, with axe for accessibility checks                         |

## Deployment

| Piece      | Where                                                                                |
| ---------- | ------------------------------------------------------------------------------------ |
| API, crons | A container image (`services/api/Dockerfile`); the Render blueprint is `render.yaml` |
| Web        | Vercel                                                                               |
