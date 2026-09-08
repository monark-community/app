# Where values come from

Three sources are available to a step, and you'll see them grouped in the **Variables** panel when a step is selected :

- **The trigger** : the event that started the flow. If the automation runs when a record is created, the trigger carries that record's details. Written as `{{ trigger.… }}`.
- **Earlier steps** : every step that runs before the selected one exposes its output. If a "Find record" step ran earlier, a later step can use what it found. Written as `{{ steps.<name>.… }}`, where `<name>` is the earlier step's **reference name** (more on that below).
- **Workflow variables** : values you set yourself with a **Set Variable** step, usable anywhere after they're set. Written as `{{ vars.<name> }}`.

A step only sees values from steps that run before it, so the Variables panel only lists what's actually available at that point in the flow.
