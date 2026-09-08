# Automations

An **automation** is a small flow you build on a canvas : a **trigger** ("when this happens") wired to one or more **actions** ("do these things"). When the trigger fires, the flow runs on the server, on its own ; you don't have to be watching.

Reach it from the **Automation** entry in the navigation rail (visible where the feature is enabled). This page covers building and running a flow ; for the details of passing values between steps, see [Using values in an automation](automation-variables.md).

## Your automations

`/automation` lists the flows in your organization. Each has an **Enabled** switch ; a flow only fires automatically when it's on, so you can build and test one safely while it's off. **New** opens the editor on a blank canvas. You can search, open, duplicate-by-editing, archive, and restore flows.

## Building a flow

The editor is a canvas. You drag nodes from the **palette** onto it and wire them together ; clicking a node opens its **config panel** on the side.

Every flow has **exactly one trigger node** at the start, which decides how it fires :

- **Event** : fires when a chosen platform event happens (a user signs in, a record is created, a role is assigned, …). Pick the event from a grouped list ; the editor shows what data that event carries so you can use it downstream.
- **Manual** : never fires on its own ; you run it yourself with **Run now**. Good for testing or on-demand jobs.
- **HTTP** : fires when an external system sends a web request to the flow's URL, with the flow's secret. Use it to let another tool kick off a flow.
- **Schedule** : fires on a recurring schedule you set in the **schedule builder** (every N minutes/hours, daily, weekly, or monthly), in your own timezone.

Wired after the trigger, **action nodes** do the work. What's available includes :

- **Communication** : send an in-app / email **notification**, send an **email**, or call an outbound **webhook**.
- **Data** : **create / update / delete / find** records in a Data Model.
- **People** : **assign or remove a role**, **get** a user, update a user's profile or metadata, activate / deactivate a user.
- **Control flow** : a **condition** that branches (true / false), a **delay** that pauses the flow (even for hours or days), **set variable** / **constant** / **transform** for shaping values.

Nodes pass values down the flow : a later node can reference the trigger's data or an earlier step's output with `{{ … }}` references, inserted by the variable picker. That's the subject of [Using values in an automation](automation-variables.md).

## Running a flow

- **Save** to persist your edits. The editor checks the graph first and tells you if something's incomplete (no trigger, a required field left empty, a loop, …) before it will run.
- **Run now** runs the flow once with a sample trigger payload, so you can watch it work without waiting for a real event.
- Turn on **Enabled** for the flow to start firing from its trigger for real.

## Run history & logs

Each flow keeps a **run history** : every run, when it happened, and whether it succeeded, is still running, or failed. Open a run to see it step by step ; each node's inputs, its output, and the **log lines** the node recorded. When a run fails, the history is where you see which node stopped it and why. Failed runs retry a few times automatically before they're marked failed.

## What a flow is allowed to do

A flow runs **as the person who created it**, and it can never do more than that person could do by hand : the privileged actions (writing records, changing roles, managing users) re-check the owner's permissions every time they run, and shrink automatically if the owner loses a permission. So an automation is a convenience, not a way around your organization's access rules.

## Reaching external systems safely

Action nodes that call out (webhook, email, or anything needing a token) read credentials from your organization's [Secrets](admin.md#secrets) by name ; you reference a secret in the node's config, and the value is fetched at run time without ever being shown in the editor or the logs.
