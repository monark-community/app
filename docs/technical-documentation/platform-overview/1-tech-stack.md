# 1. Tech stack

| Layer        | Choice                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language     | TypeScript 5.9 (ESM, full `strict` + `noUncheckedIndexedAccess`, `moduleResolution: Bundler`)                                                                    |
| Runtime      | Node ≥ 22                                                                                                                                                        |
| Monorepo     | pnpm 10 workspaces + Turborepo 2                                                                                                                                 |
| Frontend     | Next.js 15 (App Router, Turbopack) + React 19                                                                                                                    |
| Styling / UI | Tailwind CSS v4, Radix UI primitives, shadcn-style components, `class-variance-authority`, `lucide-react`, `next-themes`, `sonner`, `cmdk`                       |
| Client data  | tRPC v11 (`@trpc/react-query`) + TanStack Query v5 ; TanStack Table v8 ; `@dnd-kit` ; react-hook-form ; Tiptap (rich text) ; `@xyflow/react` (automation canvas) |
| Backend      | Express 5 + tRPC v11 (`@trpc/server/adapters/express`), `pino-http`                                                                                              |
| Database     | PostgreSQL via Prisma                                                                                                                                            |
| Auth         | Supabase Auth (session source of truth) + a shadow `User` table                                                                                                  |
| Validation   | zod at every boundary (tRPC input, request bodies, env)                                                                                                          |
| i18n         | next-intl, **en + fr** parity enforced by `pnpm check:i18n`                                                                                                      |
| Email        | nodemailer (SMTP)                                                                                                                                                |
| Storage      | Supabase Storage (via the Files module's swappable `FileStorage` interface)                                                                                      |
| Testing      | Vitest (+ Testcontainers integration), Playwright (+ axe), MSW                                                                                                   |

---
