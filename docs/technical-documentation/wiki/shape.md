# Shape

An org owns a single **tree of pages**. The module owns one Prisma model in its
own fragment `packages/wiki/prisma/wiki.prisma` under the `// ── MODULE: wiki ──`
banner (`WikiPage` ; migration `20260807063256_add_wiki_pages`), assembled into
the generated `schema.prisma` by `pnpm gen:schema`. Pages soft-delete
(`deletedAt`).

A **page** carries `title`, `icon?` (an emoji), `content` (a BlockNote block
array stored as `Json`, default `[]`) + `contentText` (its plain-text projection
via `blocksToText`, kept in sync on write so search stays a cheap text
`contains`), a nullable `parentId` (self-relation, `onDelete: SetNull`),
and an integer `position`. The `@@index([organizationId, parentId, position])`
serves the sibling-ordered tree read.
