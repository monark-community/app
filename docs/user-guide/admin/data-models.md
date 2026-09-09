# Data Models

`/admin/data-models`. Define your own record types at runtime ; no code change, no deploy. This is Monark's general-purpose database layer (Notion-databases style) ; the records themselves are browsed and edited by end users at `/data/models/<model-key>`.

### Schema builder

The list page shows every Data Model in the org ; **New model** creates one (name, an immutable URL-safe key, optional icon). Opening a model gives you its field editor :

- **Add field** : pick a type (text, long text, rich text, number, boolean, date, date-time, single-select, multi-select, relation, URL, email, formula, file, attachments) and its per-type options (select choices, relation target, formula expression, allowed file formats, …). A field's **key is immutable** after creation (it's the stored property name) ; only its label is editable later.
- **Reorder** fields by dragging ; **archive** a field to hide it from forms while keeping old values readable.
- Every model automatically owns a reserved required **title** field.
- **Request an index** on a hot field for faster filtering at scale (provisioned in the background).
- **Integrations** : map the model's fields onto another module's needs (e.g. Calendar's "time" + "calendar" slots) so records materialize into that module.

### Access

Two layers. **Model-level** : each model auto-registers per-model record permissions (read / write / delete) that surface in the role editor, so a role can be granted just one model's records. **Record-level** : an individual record can be restricted to specific roles (a record with no restriction is visible to everyone who can access the model ; a restricted record is invisible (a 404) to others). Seeing past the record layer is its own permission, **View all records** (`data-models.view-all-records`), which built-in admins hold. Being able to _edit a model's schema_ no longer implies being able to _read every record in it_ ; revoke View all records from a role to get someone who can shape a database but not read the rows other people restricted. **Record scopes** go further: a role can be limited to _the records matching a condition_ on a given database (for example, only the deals in their region, or only the ones they own), written in the same query language the filter bar uses. Roles still add up, so a person who also holds an unrestricted role keeps seeing everything ; a scope only narrows what its own role grants. You set one on the role itself : **Roles & permissions**, open a role, then **Record scopes**.

### Public forms

Where the `data-models.public-forms` flag is on, a model's editor grows a **Public forms** section : share a link so people who don't have an account can submit records to that model, without exposing the model itself.

Creating a form asks for :

- **Who can submit.** _Anyone with the link_ (one shareable URL, rate-limited) or _invited people only_ (each recipient gets a unique link and can submit once). Invited recipients are managed from the form's card.
- **Which fields go on the form.** Only the fields you pick are shown and accepted ; everything else on the model stays private. Required fields have to be included.
- Optional **intro** and **thank-you** text.

A form can also publish a **public board** : a searchable, read-only list of approved entries, which is what turns this into a feature-request or bug-report inbox rather than a write-only form. You choose who can browse it (anyone with the link, or invited people only) and which fields are visible there ; the entry title always is. Two engagement toggles sit alongside it : **voting** (upvotes, with a top-sorted board) and **discussions** (comments, posted immediately, with admins able to hide or delete them).

Deleting a form kills its link and any outstanding invites ; records already submitted through it are kept.
