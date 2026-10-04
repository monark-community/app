---
type: how-to
---

# Use values from earlier steps

Fill a step's field with real data from the run, such as the email of the person who triggered it or the record a previous step found, instead of a fixed value. A value like this is a variable, written `{{ … }}`, and it shows in the field as a chip.

## Insert a variable into a text field

1. Click the step, then click the { } icon next to the field's label.
2. Pick a source: **Trigger**, an earlier step by name, or **Workflow variables**. Or type in **Search variables…** to search them all.
3. Pick the value. It drops into the field as a chip; Backspace removes the whole chip.

Faster: type `{{` in the field and choose from the suggestions.

## Use a variable in a list, switch or number field

1. Click the { } icon (**Use a variable**) next to the field. The field turns into **Choose a variable…**.
2. Click it and pick the value as above.

Click the icon again (**Use a fixed value**) to go back.

## Name a step so it's easy to reference

Each step has a reference name, used in its variables: `{{ steps.find_record.title }}`. To change it, right-click the step, choose **Rename**, and edit **Reference name** (a letter, then letters, numbers or underscores). Every variable that points at the step is updated for you. **Display name** only changes the label on the canvas.

## Keep a value for later steps

Add a **Set Variable** step, enter a **Variable name** such as `total` and a **Value**. Every later step can use `{{ vars.total }}`, including steps after a **Delay**, and after two branches meet again. Set Variable doesn't calculate; use a **Transform** step to work a value out, then store its result.

Good to know:

- A step only offers values from steps connected before it. If it isn't connected yet, the picker has nothing to show.
- To see the actual values, [test the flow](test-a-flow.md) and look at each step's output.

Next: [Branch, loop or pause a flow](branch-loop-or-pause-a-flow.md)
