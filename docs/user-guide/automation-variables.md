# Using values in an automation

An automation is a flow of steps that runs when something happens. Most steps need a value to do their job : who to email, which record to update, what to put in a field. This page is about where those values come from and how to reuse a value that an earlier step produced, so a step can act on real data instead of something you typed by hand.

Everything here lives in the **automation editor** ; the canvas where you place steps and wire them together. Select a step to open its panel on the right ; that panel is where you fill in its fields, and where the tools below appear.

## The two kinds of value

Every field on a step holds one of two things :

- **A fixed value** : you type it (or pick it from a list) and it never changes. A subject line of "Welcome!", a toggle set to on, a number like `5`.
- **A variable** : a value taken from somewhere else in the flow, resolved fresh every time the automation runs. "The user who triggered this", "the record the previous step found", "the running total so far".

A variable is written as a token in double braces, for example `{{ trigger.email }}`. You rarely type these by hand ; the editor inserts them for you (see below). Inside a field an inserted variable shows as a small highlighted **chip** rather than raw braces, so a field full of text and values stays readable ; a chip is one unit, so a single Backspace removes the whole variable. When the automation runs, each token is replaced with the real value at that moment.

## Where values come from

Three sources are available to a step, and you'll see them grouped in the **Variables** panel when a step is selected :

- **The trigger** : the event that started the flow. If the automation runs when a record is created, the trigger carries that record's details. Written as `{{ trigger.… }}`.
- **Earlier steps** : every step that runs before the selected one exposes its output. If a "Find record" step ran earlier, a later step can use what it found. Written as `{{ steps.<name>.… }}`, where `<name>` is the earlier step's **reference name** (more on that below).
- **Workflow variables** : values you set yourself with a **Set Variable** step, usable anywhere after they're set. Written as `{{ vars.<name> }}`.

A step only sees values from steps that run before it, so the Variables panel only lists what's actually available at that point in the flow.

## Inserting a variable

The main tool is the **variable picker**. Depending on the field, you reach it in one of two ways, but it's the same picker either way :

- **Text fields** (a subject line, a message body) ; click the small **`{ }`** button next to the field's label.
- **Choice fields** (a dropdown, an on/off switch, a number) ; click the **variable toggle** next to the field to switch it into "variable" mode ; the field then becomes a **Choose a variable…** button you tap to open the picker.

The picker opens as a small panel under the field on a computer, and as a **sheet that slides up** on a phone ; so it's always fully visible, even with the keyboard open. Inside :

1. You first see the **sources** ; the Trigger, each **connected earlier step** (by name), and your **Workflow variables**. Each shows how many values it offers.
2. Tap a source to see its values (a Find record step offers `id`, `title`, `data`, …). Tap one to drop it into the field as a chip.
3. Or use the **search box** at the top to jump straight to a value by name across every source.

The picker only lists values that are actually available at that step (connected to it and already run) so you can't accidentally reference something that hasn't happened yet. If a step isn't connected to anything, the picker tells you there's nothing to reference yet.

**Two shortcuts in text fields.** In a text field you can also just start typing `{{` to get the same suggestions inline, and typing a full `{{ … }}` turns into a chip as soon as you close it. The `{ }` button is the discoverable way ; the typing is the fast way.

If a choice field already holds a variable when you open the step (for example in an automation you saved earlier), it shows the variable automatically, so a saved value is never hidden behind a dropdown that has no matching option.

## Reference names

Each step has a **reference name** ; the short handle other steps use to point at it, like `find_record` in `{{ steps.find_record.id }}`. The editor gives every step a sensible name automatically, derived from its type, and keeps them unique within the flow.

To change one, right-click the step and choose **Rename**. The dialog has two fields :

- **Display name** : the label shown on the step in the canvas. Purely cosmetic ; name two "Find record" steps "Find the buyer" and "Find the seller" to tell them apart.
- **Reference name** : the handle used in `{{ steps.… }}`. It must be unique and use only letters, numbers, and underscores. When you change it, every reference pointing at this step is updated automatically, so nothing breaks.

## Workflow variables and the Set Variable step

A workflow variable is a value you name once and reuse anywhere later ; handy when the same value is needed in several places, or when different branches of the flow need to feed a single value into a later step.

Add a **Set Variable** step where you want to set it. Give it a **name** (say `reward_total`) and a **value** (a fixed value, or a variable from an earlier step). From then on, any later step can use `{{ vars.reward_total }}`, and it appears in the **Workflow variables** group of the Variables panel.

Two things worth knowing :

- A workflow variable survives a **delay**. If your flow pauses on a Delay step and picks up later, the variables you set before the pause are still there when it resumes.
- Set Variable stores a value as-is ; it doesn't do maths. To compute something (a sum, a formatted string), use a **Transform** step to work it out, then store its result with Set Variable.

## Checking what a value will be

Tokens are resolved when the automation runs, so the surest way to see a real value is to run it. Use **Run now** (or trigger the automation for real), then open a step from the run to see the exact input it received and the output it produced. That output is also what later steps reference, so a test run is the quickest way to confirm you're pointing at the right thing.
