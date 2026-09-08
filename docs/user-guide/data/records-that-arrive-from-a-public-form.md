# Records that arrive from a public form

Where your admins have enabled public forms, some of a model's records won't have been typed in by a colleague : they'll have been submitted through a shared link by someone without an account (a feature request, a bug report, a survey answer). Those arrive as ordinary records, so everything above applies to them : they show in the table, respect the same permissions, and can be filtered and edited like any other row.

Two things are worth knowing when a model is fed this way :

- **Only the fields on the form were filled in.** A public form exposes a subset of the model's fields ; everything else on a submitted record starts empty for you to triage.
- **A board may be attached.** If the form publishes a public board, approved entries are visible outside the app, and outside people may be voting on or commenting on them. Comments post immediately ; an admin can hide or delete one from the board.

Setting any of this up is an admin job : see [Public forms](../admin/data-models.md#public-forms).
