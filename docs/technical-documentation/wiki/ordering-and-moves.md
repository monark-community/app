# Ordering and moves

Siblings hold a `position` in **gaps of 10** (the house pattern from kanban /
data-models). `createPage` appends at `max(position) + 10` within its parent.
`movePage`:

1. Collects the moved page's subtree and **rejects** a target parent inside it
   (`ValidationError`) : the cycle-guard that keeps the tree acyclic.
2. In a transaction, loads the target parent's sibling list (excluding the moved
   page), splices the moved page in **before `beforeId`** (or appends when null /
   unknown), and rewrites every sibling's `position` to `(i + 1) * 10`.

The moved page's own subtree rides along untouched ; only its `parentId` changes.
