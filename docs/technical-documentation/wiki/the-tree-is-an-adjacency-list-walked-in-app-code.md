# The tree is an adjacency list, walked in app code

There is no `WITH RECURSIVE`. Every tree operation loads the org's flat page list
(a light `{ id, parentId, … }` projection) and walks it in memory :

- **Ancestors** (`getAncestors`) : follow `parentId` up from a page, guarding
  against a self-referential loop, and reverse to root-first for the breadcrumb.
- **Subtree** (`collectSubtree`) : build a `parentId → children[]` map, then DFS
  from the root collecting ids. Used by move (the cycle-guard), soft-delete, and
  restore.

Per-org wikis are small enough that loading the flat list is cheaper than a
recursive query ; graduate to a CTE only if a wiki ever grows very large. The
projection is capped implicitly by org size, not paginated ; a deliberate
exception to the list-pagination rule, since the sidebar renders the whole tree.
