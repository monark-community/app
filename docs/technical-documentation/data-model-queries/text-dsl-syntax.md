# Text DSL syntax

```
field:value                 default op for the field's kind
field:a,b                   a list (any-of for select / multi-select)
field:=value                explicit equality (text exact, case-insensitive)
field:>value  >= < <=       comparison (number: gt…; date: after…)
field:~value  !~ ^ $        contains / notContains / startsWith / endsWith
field:&a,b                  has-all-of (multi-select)
field:a..b                  between (number / date)
field:empty | field:present presence (is-empty / is-not-empty)
field:true | field:false    boolean
-field:...                   negation ( -field:a,b → none-of )
relation.subField:value      traverse a relation ( one level )
a b        (implicit AND)    a OR b        ( parentheses group )
```

`parseQuery` / `printQuery` take a `FieldKinds` map (field key → kind, the same metadata
the compiler and autocomplete read), so an unknown field or an operator illegal for the
field's kind is a `QuerySyntaxError`. The pair is a true inverse on normalized trees
(single-child non-negated groups collapse to their child).
