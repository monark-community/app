# Record scopes

The same tree also powers **authorization**: a `DataModelRoleScope` grants a role "the records
matching this query" on a model, and the scope is AND-ed into the very filter these pages
describe, so there is one compiler and no second enforcement path to keep in step.

See [record-scopes.md](../record-scopes.md) for the full design.
