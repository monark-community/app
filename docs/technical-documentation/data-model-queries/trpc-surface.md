# tRPC surface

`dataModels.records.list` accepts an optional `filter` (the `filterQuerySchema` tree)
alongside the legacy `fieldFilters`. When `filter` is present it takes precedence; otherwise
`fieldFilters` are translated into the same tree. Either way exactly one path runs. Read-only ; no new permission/event/notification (the
existing `data-models.record-read` gate and record role-access still apply). Saved views
live under `dataModels.views.*` (see above).
