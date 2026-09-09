# Delete / restore

`softDeleteSubtree` stamps `deletedAt` on the whole subtree and returns the id
list ; `restoreSubtree` clears it (walking the tree with `includeDeleted` so it
can find the buried descendants). The `wiki.page-deleted` event carries the full
`pageIds[]` so subscribers see the fan-out, not just the root.
