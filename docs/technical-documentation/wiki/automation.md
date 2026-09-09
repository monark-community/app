# Automation

Two-directional, mediated entirely by the core event bus + registries (the wiki
router has zero automation coupling):

- **Triggers** are free : the four registered `wiki.page-*` event types show up
  in the automation trigger picker automatically (the picker enumerates the
  shared event-type registry), so a flow can start on any wiki change.
- **Actions** : `server/nodes.ts` registers three action nodes via
  `@monark/automation`'s `registerAutomationNodes("wiki", …)` (wired at api boot):
  `wiki.create-page`, `wiki.update-page`, `wiki.delete-page`. They mirror the
  built-in Data Record nodes exactly : resolve the automation owner, gate on that
  owner's own `wiki.*` permission (`hasPermission`, so a node can't do what its
  owner couldn't in the UI), call the data layer directly, and ; like those nodes
  ; **emit no wiki events** (a flow can't re-trigger itself). Text bodies convert
  to blocks via `textToBlocks` (`@monark/common/blocks`). `@monark/automation` is
  a **core** module, so wiki depending on it is a normal extended→core edge (no
  `integrates` flag ; that's only for extended→extended).
