# Phased implementation

Each phase is independently shippable. Phases 1–2 alone resolve most of the pain
(they make references usable everywhere) without changing wire semantics, so the
direction can be validated before committing to 3–5.

1. **Node output schemas.** Add `AutomationOutputField` to
   [contracts/nodes.ts](../../../packages/automation/src/contracts/nodes.ts) and an
   `outputFields` array to the descriptor. Declare outputs on every built-in node
   ([server/nodes/](../../../packages/automation/src/server/nodes)). Serialize them
   through `nodeTypes.list`. Pure additive metadata ; no runtime change.

2. **In-field variable picker.** Generalize the trigger Outputs panel in
   [automation-editor.tsx](<../../../services/web/src/app/(authed)/automation/[id]/automation-editor.tsx>)
   into an "available data" tree sourced from the trigger fields + every upstream
   node's `outputFields`, resolved by walking the graph backwards from the
   selected node. Click-to-insert the `{{ }}` token into the focused field
   (including mid-text). Keep the trigger Outputs panel behavior as a subset.

3. **Stable name addressing (shipped).** Every node carries a unique, editable
   **slug** ([slug.ts](../../../packages/automation/src/contracts/slug.ts),
   `NodeInstance.slug`), derived from its label on creation and de-duplicated. The
   engine mirrors each upstream output under `steps.<slug>` in the resolution
   scope ([engine.ts](../../../packages/automation/src/server/engine.ts)) alongside
   the raw node-id key (kept for backward-compat), and `dataDependencies`
   resolves a `{{ steps.<slug> }}` reference back to its node for ordering. The
   editor assigns slugs on load + on drop, enforces uniqueness, offers slug
   editing in the rename dialog (rewriting `{{ steps.<oldslug> }}` references so
   they don't break), emits `{{ steps.<slug> }}` tokens from the picker, and
   rewrites any legacy `{{ <nodeId> }}` reference to slug form on load (a silent
   display migration that self-persists on the next save). Not built: renaming a
   node's display _name_ does not touch its slug (slug is the stable address,
   edited explicitly).

4. **Remove field-wires (option a : shipped).** Drop the data-authoring path
   from the editor entirely: no `field:` ports on the node face, no per-field
   "expose as input" toggle, no data edges. Data comes only from the picker /
   `{{ }}` references. The engine keeps its `field:` resolution branch so
   already-saved graphs run unchanged, and the editor rewrites any legacy
   `field:` edge to an equivalent `{{ source }}` (or `{{ source.value }}` for a
   single-`value` source) reference on load, self-migrating on the next save.
   (`unwrapLinkedValue` is retained only for that legacy-edge runtime path.)

5. **Workflow variables (shipped).** A run-global `vars` scope (`{{ vars.<name> }}`),
   a **Set Variable** node ([set-variable.ts](../../../packages/automation/src/server/nodes/set-variable.ts))
   that writes `vars[name] = value`, and picker entries under a "Workflow variables"
   group listing the names any upstream Set Variable node defines. This is the
   literal "global variable" the original design intended, distinct from per-step
   outputs: set it on either arm of a branch and read it after the branches
   converge, or give a value a stable readable name. The write is durable across a
   suspend : the engine rebuilds `vars` on resume by replaying each node's
   `collectVars(output)` from its persisted step (in `sequence` order), a generic
   seam ([registry.ts](../../../packages/automation/src/server/registry.ts)) any node
   may implement, not just Set Variable. Computed values (a running total) compose
   with a Transform node feeding the Set Variable's value. Not built: expression
   evaluation inside Set Variable itself (Transform covers it) and per-branch var
   scoping (vars are flat and run-global).
