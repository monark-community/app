---
type: how-to
---

# Branch, loop or pause a flow

Control which steps run, how often, and when.

## Take a different path depending on a value

1. Add a **Condition** step.
2. Set **Value** (usually a variable, such as the trigger's status), an **Operator** such as **equals**, and **Compare to**.
3. Connect the steps for "yes" to its **True** output and the steps for "no" to its **False** output.

Only one side runs.

## Repeat steps for every item in a list

1. Add a **For Each** step after a step that returns a list, such as **Find Records**.
2. In **List**, insert that list as a variable, for example its `records` value.
3. Connect the steps to repeat to **Each item**. Inside them, the current item is available as the For Each step's `item` value.
4. Connect what should happen afterwards to **Done**.

A list can have up to 1,000 items. The repeated steps can't include a **Delay** or another **For Each**.

## Wait before the next step

Add a **Delay** step and enter **Delay (seconds)**, up to 86,400 (24 hours). The run shows as **Waiting (delayed)** until it continues.

## Carry on when a step fails

1. Click the step that might fail.
2. Under **Advanced**, turn on **Error output**. The step gets an **On error** output.
3. Connect the steps that should handle the failure, such as a notification, to **On error**.

Without this, a failing step stops the run.

Next: [Test a flow](test-a-flow.md)
