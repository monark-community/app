---
type: how-to
---

# Show a model's records on a calendar

Turn each record into a calendar event, for example to see every project's deadline on the team calendar.

1. Make sure the model has two fields: a **Date** or **Date & time** field for the event's time, and a **Relation** field whose **Target** is **Calendar**, for the calendar the event goes on. See [Add and change fields](add-and-change-fields.md).
2. In **Admin**, open **Data Models** and click the model.
3. Under **Integrations**, find the calendar card. Pick your date field for the time, and your relation field for the calendar.
4. Turn on **Enabled** and click **Save**.

From then on, each record you create or edit with both fields filled in appears as an event on the calendar its relation points to. Records that already existed appear the next time they're edited. Deleting a record removes its event.

Good to know: events are a single point in time, not a range.

Next: [Publish a public form](publish-a-public-form.md)
