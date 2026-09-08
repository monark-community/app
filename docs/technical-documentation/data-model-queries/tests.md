# Tests

- `tests/query.test.ts` ; taxonomy + schema (unit).
- `tests/query-dsl.test.ts` ; parser, printer, round-trip (unit).
- `tests/integration/query-language.test.ts` ; every operator family, groups, negation,
  and the keyset pagination contract against a real Postgres testcontainer.
