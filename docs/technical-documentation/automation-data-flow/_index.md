# Automation data flow: variables, references, and wiring

Status: accepted design, **fully shipped (phases 1–5).** Phase 1–2: node output schemas ;
the variable picker sources them so upstream fields show without a test run, and
click-to-insert drops a `{{ }}` token at the focused field's cursor. References
were also found to be **silently broken for node ids** (the editor mints
hyphenated ids like `n-a1b2`, but the interpolation regex used `[\w.]`, which
excludes `-`, so a `{{ n-a1b2.field }}` token never resolved) ; the regex now
allows `-`, and `executionOrder` pulls a referenced value source into the run +
orders it before its consumer via a `{{ }}` reference, not only via a `field:`
edge. Phase 4: the data-wire authoring path was **removed** (option a below, not
the option-b sugar this doc originally leaned toward) ; no more `field:` ports,
per-field expose toggle, or data edges in the editor ; data flows only through
`{{ }}` references + the picker. Legacy `field:` edges in already-saved graphs
still resolve at run time (the engine keeps that branch) and the editor rewrites
them to references on load, so old automations run unchanged and self-migrate on
the next save. Phase 5: **workflow variables** ; a run-global `vars` scope
(`{{ vars.<name> }}`) plus a Set Variable node that writes into it, distinct from
per-step outputs and durable across a suspend. Phase 3: **stable-name
addressing** : every node has a unique, editable slug and its output is addressed
as `{{ steps.<slug>.field }}` (the engine still resolves the legacy `{{ <nodeId> }}`
form, and the editor rewrites old graphs on load). Owner: automation module.
Related: [automation.md](../automation/_index.md).

This note settles how an automation node gets the values it runs on: literals,
references to other nodes' output ("global-like variables"), and wired data
connections. It replaces two overlapping, half-finished mechanisms with one
runtime concept plus a proper authoring surface.

## In this section

- **[The problem](the-problem.md)**
- **[Prior art](prior-art.md)**
- **[Decision](decision.md)**
- **[Phased implementation](phased-implementation.md)**

## Consequences

- One runtime path for data ; the redundancy is gone.
- References are usable everywhere via the picker, not just for the trigger ;
  including non-text fields (dropdown / switch / number), which get a small
  value↔variable toggle that swaps the native control for a `{{ }}` text box
  (forced on when the stored value is already an expression, so a saved reference
  never vanishes from a dropdown with no matching option). `event-type` and
  `schedule` are excluded (structural).
- Node authors declare outputs once, and every consumer (picker, type hints,
  future validation) benefits, exactly like the event-field metadata.
- The `unwrapLinkedValue` scalar hack is no longer reachable from new authoring ;
  it survives only on the legacy `field:` runtime path for old saved graphs.
- Control-flow wiring is unaffected.


## Non-goals (for now)

- A full expression language (operators, functions). The `{{ path }}` resolver
  stays path-only ; a Transform node covers computed values.
- Strong static type-checking of references. Output `type` is a hint for the
  picker and for soft warnings, not a compiler.
