---
type: decision
status: accepted
date: 2026-08-07
---

# 0012. Walk the wiki page tree in application code

## Context

The wiki needs pages nested to any depth, with a breadcrumb, a move that can't create a cycle, and delete and restore that act on a whole branch. Each page points at its parent (an adjacency list), so a move changes one row. The open question was where to walk the tree. Per-organization wikis are small, the sidebar shows the whole tree anyway, and only titles are needed to draw it; bodies load one page at a time.

## Options

| Option                                 | For                                                                 | Against                                                                      |
| -------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Walk the list in application code      | Plain Prisma, no raw SQL; reuses the list the sidebar already loads | Every tree operation loads the organization's whole page list                |
| Recursive SQL query (`WITH RECURSIVE`) | The database does the walk; scales to very large trees              | Raw SQL outside Prisma's typed client, for trees that stay small in practice |

## Decision

Walk the tree in application code: load the organization's light page list (`id`, `parentId`), build a parent-to-children map, and collect ancestors or a subtree from it. For a small tree, loading the flat list is cheaper than a recursive query.

## Consequences

- Move, delete and restore stay simple Prisma calls: a subtree is collected in memory, then changed with one bulk update.
- The cycle check on move is a membership test on the collected subtree.
- The tree read isn't paginated, a deliberate exception to the list-pagination rule, since the sidebar renders every page.
- If a wiki ever grows very large, the walk graduates to a recursive query. The data layer marks where.
