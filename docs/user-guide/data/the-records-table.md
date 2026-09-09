# The records table

Records show up in a table :

- The **title column** is pinned on the left ; every model has a title, and it's how you recognize a row.
- The model's other fields become the remaining columns.
- **Click a row** to open that record (see [Viewing & editing](#viewing--editing-a-record)).
- **Search** (top of the table) matches against the title as you type.
- **Prev / Next** page through the records ; the table shows a page at a time.

![The records table : one row per record, with the title column pinned first and each field rendered by its type (money, checkbox, date, status chip, tags, people).](../../assets/records-table.png)

A model with many fields is wider than the screen ; the table scrolls sideways, and the title column stays pinned while it does.

### Filtering

Two ways to narrow the list, depending on what your deploy has enabled :

- **Filter menu** (funnel icon) : pick a field and a condition (contains, is, greater than, on-or-before, is any of, is empty, …). The available conditions match the field's type. Active filters show as removable chips.
- **Query bar** (when the query-language feature is on) ; type a compact query like `status:open -assignee:present due:@today..@endOfWeek`. It understands the same fields, plus **`@variables`** that resolve when you run it : `@me` (you), `@today`, `@startOfWeek`, and so on. You can flip between the menu and the bar ; they describe the same filter.

### Saved views

Once you've built a filter you like, save it as a **view** (the views menu). A view is a named filter for that model :

- **Personal** by default : only you see it.
- **Shared** : everyone with access to the model can use it.
- You can rename or delete a view you own.
