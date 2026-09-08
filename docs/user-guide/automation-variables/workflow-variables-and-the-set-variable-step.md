# Workflow variables and the Set Variable step

A workflow variable is a value you name once and reuse anywhere later ; handy when the same value is needed in several places, or when different branches of the flow need to feed a single value into a later step.

Add a **Set Variable** step where you want to set it. Give it a **name** (say `reward_total`) and a **value** (a fixed value, or a variable from an earlier step). From then on, any later step can use `{{ vars.reward_total }}`, and it appears in the **Workflow variables** group of the Variables panel.

Two things worth knowing :

- A workflow variable survives a **delay**. If your flow pauses on a Delay step and picks up later, the variables you set before the pause are still there when it resumes.
- Set Variable stores a value as-is ; it doesn't do maths. To compute something (a sum, a formatted string), use a **Transform** step to work it out, then store its result with Set Variable.
