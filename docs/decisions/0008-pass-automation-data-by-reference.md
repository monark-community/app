---
type: decision
status: accepted
date: 2026-08-02
---

# 0008. Pass automation data by reference, not by wire

## Context

An automation node's settings could get values three ways: a typed literal, a `{{ path }}` reference to the trigger or an earlier node's output, or a data wire from another node into a field's port. References and wires were two front ends for the same thing, an upstream node's output, and both were half-built. Nodes were addressed by generated ids such as `n-a1b2`, so nobody could write a reference by hand, and a regex bug meant references to hyphenated ids never resolved at all. Wires were easy to draw but passed a node's whole output, so getting one field meant falling back to a reference. Nodes declared output ports but not the shape of what they produced, so the editor couldn't offer a picker.

The closest tools differ. Unreal Blueprints wires typed data pins, which works because it is strongly typed and desktop-only. n8n and Make, closer to Monark, don't wire fields: every field is an expression, filled from a picker listing earlier steps by name with their output fields. All three keep control flow separate from data.

## Options

| Option                                                  | For                                                       | Against                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Keep both references and data wires as they were        | No migration                                              | Two incomplete paths; whole-output wires; references unusable for nodes                     |
| Keep data wires as visual sugar that writes a reference | One runtime path; keeps connect-the-dots                  | A second port type per field to render, hit-test and validate, for nothing the picker lacks |
| References only, with a picker; remove data wires       | One runtime path and one authoring surface; least clutter | Loses drawing a data wire; old graphs need migrating                                        |

## Decision

Data moves only by `{{ }}` reference, over one scope: `trigger`, `steps.<name>` (a stable, editable name per node) and `vars` (run-wide workflow variables written by a Set Variable node). Nodes declare their output fields, and a click-to-insert picker lists everything available at that point in the graph. Wires carry control flow only.

The design note of 2026-08-01 first chose the sugar option. Once the id bug was fixed and the picker shipped, a wire added nothing the picker didn't already do, so data wires were removed instead (2026-08-02).

## Consequences

- One resolution path at run time, usable from every setting, including dropdowns, switches and number boxes through a variable-mode toggle.
- Node authors declare outputs once, and the picker and type hints follow.
- Saved graphs with old data wires or id-based references still run; the editor rewrites them to named references on load, and they persist on the next save. The engine keeps a branch for legacy wires.
- References are paths, not expressions, and aren't type-checked; computed values need a Transform node.
- Workflow variables are flat and run-wide, with no per-branch scope.
