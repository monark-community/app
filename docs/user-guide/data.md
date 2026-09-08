# Data (records)

**Data Models** are custom databases your organization's admins define ; a "Projects" table, a "Universities" table, whatever your team needs. Each model has its own fields ; the rows are called **records**. This page is about working with records day-to-day. (Defining the models + fields themselves is an admin task, covered under [Data Models in the admin guide](admin.md#data-models).)

Reach it from the **Data** entry in the navigation rail. Which models you see (and whether you can view, add, edit, or delete their records) depends on the permissions your role has been granted for each model.

## Finding a model

The Data section lists the models available to you (a sidebar on wide screens, a tab strip on narrow ones). Pick one to open its records. Each model lives at a stable URL (`/data/models/<model-key>`), so you can bookmark or share a link to a specific model.

## The records table

Records show up in a table :

- The **title column** is pinned on the left ; every model has a title, and it's how you recognize a row.
- The model's other fields become the remaining columns.
- **Click a row** to open that record (see [Viewing & editing](#viewing--editing-a-record)).
- **Search** (top of the table) matches against the title as you type.
- **Prev / Next** page through the records ; the table shows a page at a time.

### Filtering

Two ways to narrow the list, depending on what your deploy has enabled :

- **Filter menu** (funnel icon) : pick a field and a condition (contains, is, greater than, on-or-before, is any of, is empty, …). The available conditions match the field's type. Active filters show as removable chips.
- **Query bar** (when the query-language feature is on) ; type a compact query like `status:open -assignee:present due:@today..@endOfWeek`. It understands the same fields, plus **`@variables`** that resolve when you run it : `@me` (you), `@today`, `@startOfWeek`, and so on. You can flip between the menu and the bar ; they describe the same filter.

### Saved views

Once you've built a filter you like, save it as a **view** (the views menu). A view is a named filter for that model :

- **Personal** by default : only you see it.
- **Shared** : everyone with access to the model can use it.
- You can rename or delete a view you own.

## Creating a record

Click **New**. A form opens with one input per field, matching each field's type :

- **Text / long text / rich text**, **number**, **checkbox**, **date / date-and-time**, **URL**, **email**.
- **Select** (pick one) and **multi-select** (pick several) from the choices the admin defined.
- **Relation** : link to a record in another model.
- **File / attachments** : upload one or several files.
- **Formula** fields are **read-only** ; they compute automatically from the record's other fields, so there's nothing to fill in.

The **title** is required. Fill in what you need and save.

## Viewing & editing a record

Open a record to see its full detail. Depending on the screen it opens as a side panel or a full page. Edit any field in place and save ; formula fields update themselves as you change the fields they depend on. You can also **delete** a record (it's archived, and an admin can restore it).

## Bulk edit

Select several rows with their checkboxes to get a bulk-edit bar, then set a field's value across all of them at once ; handy for re-assigning or re-statusing a batch of records.

## Record access

If your role can manage a model's records, an individual record can be **restricted to specific roles** (the record's access section). A restricted record is invisible (not even listed) to anyone whose roles aren't on it. A record with no restriction is visible to everyone who can access the model. Data admins always see every record.

## Following a record or a model

Stay in the loop on changes with the **Follow** toggles :

- **Follow a record** ("watch this page") : you're notified when that record changes or is deleted.
- **Follow the model** ("subscribe to the database") ; you're notified when _any_ record in it is created, changed, or deleted.

Notifications arrive in-app (the bell). You only ever get notified about records you're allowed to see, and never about your own edits. Manage the on/off default for these under [notification preferences](account.md#notifications).
