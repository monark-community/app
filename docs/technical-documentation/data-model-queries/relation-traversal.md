# Relation traversal

A dotted field filters through a relation : `assignee.title:alice` matches records whose
related record satisfies the sub-condition. The AST needs no new shape ; the leaf's
`field` is just `"assignee.title"`; the compiler splits on the dot. It compiles to an
`EXISTS` over the target model's `DataRecord`s:

```sql
EXISTS (SELECT 1 FROM "DataRecord" t
        WHERE t."dataModelId" = <targetModelId>
          AND t."deletedAt" IS NULL
          AND <id-membership>            -- t.id = r.data->>'assignee' (ONE) or IN the array (MANY)
          AND <target role-access on t>  -- so traversal can't surface unreadable rows
          AND <sub-condition on t.data>)
```

The column root is parameterized (`r.data` for the outer record, `t.data` inside the
subquery) so the outer relation value stays unambiguous under the alias shadow. Safety:
the router (`buildRelationTargets`) only resolves DATA_MODEL relations in the caller's
org, requires the caller can **read** the target model (else 403), and threads the
target's **row-level** role-access into the subquery ; so a traversal can't reveal a
related record the caller couldn't open directly. **One level only** (`a.b`, not
`a.b.c`); SYSTEM_MODEL relation targets aren't traversable. The web query bar gets the
dotted fields as "virtual" entries from `dataModels.records.queryFields`, so they parse +
autocomplete like any field.
