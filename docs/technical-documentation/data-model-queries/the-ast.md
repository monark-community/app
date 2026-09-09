# The AST

```ts
type FilterLeaf = { kind: "leaf"; field: string; op: FilterOp; value?: string | string[] };
type FilterGroup = {
  kind: "group";
  combinator: "and" | "or";
  negate?: boolean;
  children: FilterNode[];
};
type FilterNode = FilterLeaf | FilterGroup;
```

Values are always **string-encoded** on the wire (a scalar for most ops, a `string[]`
for set membership, exactly two for `between`); the compiler coerces per the field's
kind. The wire schema (`filterQuerySchema`) caps total nodes (100) and nesting depth (8)
so an adversarial input can't drive unbounded recursion or a monster SQL `where`.

### Operator taxonomy

The 15 field types collapse into a few **filterable kinds** (`filterableKindOf`); each
kind offers a fixed operator set (`legalOps`). A `FORMULA` field filters as whatever its
expression yields (resolved through `inferResultType`).

| Kind        | Types                                  | Operators                                                                   |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------- |
| text        | TEXT, LONG_TEXT, RICH_TEXT, URL, EMAIL | is, isNot, contains, notContains, startsWith, endsWith, isEmpty, isNotEmpty |
| number      | NUMBER                                 | eq, neq, gt, gte, lt, lte, between, isEmpty, isNotEmpty                     |
| boolean     | BOOLEAN                                | isTrue, isFalse                                                             |
| date        | DATE, DATETIME                         | is, before, after, onOrBefore, onOrAfter, between, isEmpty, isNotEmpty      |
| select      | SELECT                                 | isAnyOf, isNoneOf, isEmpty, isNotEmpty                                      |
| multiSelect | MULTI_SELECT                           | hasAnyOf, hasAllOf, hasNoneOf, isEmpty, isNotEmpty                          |
| relation    | RELATION                               | isAnyOf, isEmpty, isNotEmpty                                                |
| attachments | FILE, ATTACHMENTS                      | isEmpty, isNotEmpty                                                         |
