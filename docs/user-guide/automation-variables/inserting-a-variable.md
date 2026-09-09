# Inserting a variable

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
