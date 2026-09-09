# Codegen tools

All tools live in `tools/` and run via pnpm scripts ; **never hand-edit a generated file** (CI fails on drift) :

| Command            | What it does                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `pnpm gen:module`  | Scaffold a new module package with `/server`, `/client`, `/contracts`. Registers it in the manifest. |
| `pnpm gen:schema`  | Assemble `schema.prisma` from `base.prisma` + each module's `prisma/<module>.prisma` fragment.       |
| `pnpm gen:events`  | Regenerate the `DomainEvent` union from every module's event definitions.                            |
| `pnpm gen:routers` | Regenerate the tRPC app router from every module's server router.                                    |
| `pnpm gen`         | Run all codegen steps (`gen:schema` + `gen:events` + `gen:routers`).                                 |
| `pnpm check:tiers` | Enforce the core/extended dependency rules from the manifest.                                        |

Add `--check` to `gen:schema` / `gen:events` / `gen:routers` in CI to fail on drift without overwriting.
