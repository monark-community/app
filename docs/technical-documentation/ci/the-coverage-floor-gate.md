# The coverage-floor gate

`coverage-upload` fails the build if any package drops below its floor, so a
regression in a tested package breaks CI rather than silently eroding coverage.
The floors live in [`tools/merge-coverage.ts`](../../../tools/merge-coverage.ts) as
`THRESHOLDS`, one entry per package `{ lines, statements, functions, branches }`.

Two rules the gate enforces:

- **Every package that emits coverage MUST have an entry.** A package that
  produces a coverage report but has no floor fails the gate ("produced coverage
  but has no THRESHOLDS entry") ; this is how a newly-added module can't ship
  un-gated. A package with **no** `test:coverage` script produces no report and
  is listed as "skipped" (e.g. pure libraries covered only via their consumers).
- **Floors are a regression guard, not a brag.** Set each metric a few points
  below the measured baseline (round down to the nearest 5 %). Ratchet a floor
  up when new tests justify it; only lower one as a conscious decision, with a
  comment saying why.

When you add a module with tests, add its floor in the same PR. For a module
whose real coverage comes mostly from an **integration** suite (a router /
webhook), a floor set off the unit-only number is a safe lower bound (merged ≥
unit); ratchet it up once a merged CI run publishes the real number.
