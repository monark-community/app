---
type: how-to
---

# Test a flow

Run the flow once, now, and watch what each step does. You don't have to turn the flow on or wait for its trigger.

1. Fix anything the warning button in the top bar lists. It shows a count of issues, such as a required field left empty or a step that isn't connected; click it, then click an issue to jump to its step. **Run now** stays disabled while there are errors.
2. Click **Run now**. Unsaved changes are saved first.
3. Watch the steps light up as they run. The **Execution log** at the bottom shows each step's status.
4. Click any step to see its **Last run** (the **Input** it received and the **Output** it produced) and its **Logs**.
5. Click **Clear run** to return the canvas to normal.

Good to know:

- A test is a real run: emails are sent and records are changed. Point those steps at test data while you build.
- The trigger's fields get placeholder values, such as `sample-title`, since no real event happened.
- The test acts as the flow's creator, whoever clicks **Run now**.

Next: [Turn a flow on or off](turn-a-flow-on-or-off.md)
