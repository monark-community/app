# Saved views

A saved view is a named query tree per model (`DataRecordView` ; a core table under the
data-models banner in `base.prisma`, migration `20260802140000_add_data_record_views`).
Personal by default (`createdBy` is the owner); `shared = true` makes it visible to
everyone with read access to the model. The tRPC surface `dataModels.views.{list, create,
update, delete}` gates reading on `data-models.record-read` and scopes editing to the
owner (a shared view is still only editable by its creator). The stored `query` is
validated with `filterQuerySchema` on write; a view that references a since-removed field
simply errors when the compiler rejects it at run time ; nothing to migrate. The web
`ViewsMenu` loads a view by printing its tree back to query text, and saves the current
tree (with an optional share toggle).
