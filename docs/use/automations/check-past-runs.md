---
type: how-to
---

# Check past runs

See whether a flow has been running as expected, and which step stopped a run that failed.

1. Open the flow and click **Run history**. The latest 25 runs are listed, newest first, with their status: **Pending**, **Running**, **Succeeded**, **Failed** or **Canceled**.
2. Click a run to see each step it went through and that step's status. A failed run also shows the error.

To see a step's exact input and output, reproduce the run with **Run now**; see [Test a flow](test-a-flow.md).

Good to know:

- A run that fails is retried automatically, up to three attempts in all, before it's marked **Failed**.
- A step marked **Skipped** was on a branch that didn't run, such as the unused side of a **Condition**.
- A step can fail because the flow's creator lacks a permission it needs, such as editing records. The flow can never do more than its creator could do by hand.
