---
type: how-to
---

# Build a flow

1. Open **Automation** in the navigation rail and click **New automation**.
2. Enter a **Name** and click **Create**. The editor opens with an **Event Trigger** on the canvas.
3. Click the trigger and set what starts the flow. See [Choose a trigger](choose-a-trigger.md).
4. Click **Add node** (or press N), pick a category, then the step you want, such as **Send Notification**. It appears on the canvas.
5. Drag from the right edge of the trigger to the left edge of the new step to connect them. Steps run in the order you connect them.
6. Click the step and fill in its fields in the panel on the right. Fields marked with \* are required.
7. Repeat steps 4 to 6 for each step, then click **Save changes**.

A new flow is off, so it doesn't run by itself until you [turn it on](turn-a-flow-on-or-off.md).

## Change or remove a step

Right-click a step:

- **Rename** gives it a clearer name on the canvas.
- **Replace** swaps it for another step of the same kind. Its settings are cleared; connections that still fit are kept.
- **Delete** removes it. You can also select a step or connection and press Delete.

Good to know:

- Steps that call outside services, such as GitHub or Discord, ask for a secret by name. Your admin adds secrets in **Admin**, under **Secrets**; you never see their values.
- A flow acts as the person who created it, with that person's permissions, whoever edits or runs it.

Next: [Choose a trigger](choose-a-trigger.md)
