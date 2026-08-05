import { z } from "zod";
import { ValidationError } from "@monark/common";
import {
  automationGraphSchema,
  validateGraph,
  type AutomationGraph,
  type GraphIssue,
} from "@monark/automation/contracts";
import type { AppCaller } from "../public/caller";
import type { InAppTool } from "./tools";

// In-app-only agent tools for the Automation module. Unlike the record tools
// (which come from the public V1_ROUTES), these are NOT exposed over the public
// API / MCP — automations are an internal power-user surface. They run through
// the same in-process caller as the user, so each procedure's own permission
// (automation.view / .create / .manage / .run) gates them; mutating tools are
// confirm-gated by the chat loop.

// Turn a validator issue into a line the model can act on.
function formatIssue(i: GraphIssue): string {
  const where = i.nodeId
    ? ` (node "${i.nodeId}"${i.fieldKey ? `, field "${i.fieldKey}"` : ""})`
    : "";
  return `• ${i.code}${where}`;
}

// Validate a graph against the live node registry before we persist it. create /
// update don't validate server-side (only runNow does), so we pre-flight here to
// give the model an itemized fix list instead of saving something unrunnable.
async function assertGraphValid(caller: AppCaller, graph: AutomationGraph): Promise<void> {
  const { nodes } = await caller.automation.nodeTypes.list();
  const byType = new Map(nodes.map((d) => [d.type, d]));
  const errors = validateGraph(graph, (t) => byType.get(t)).filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new ValidationError(
      `This automation isn't valid yet:\n${errors.map(formatIssue).join("\n")}`,
    );
  }
}

const GRAPH_GUIDE =
  "An automation graph is { nodes: [...], edges: [...] }. " +
  "Each node = { id (unique string you assign), type (a node-type key from automation_list_node_types, e.g. 'automation.event-trigger' or 'automation.send-email'), position {x,y} (lay out left→right, ~220px apart), config (object keyed by that node type's configFields keys), slug (lowercase snake_case, unique — other nodes read this node's output as {{ steps.<slug>.<field> }}), name (optional label) }. " +
  "Exactly ONE trigger node is required (a type whose kind is 'trigger'); for an event-trigger set config.eventType to a value from automation_list_trigger_events. " +
  "Each edge = { id, source (node id), target (node id), sourceHandle (output id, usually 'out'; a condition has 'true'/'false'), targetHandle (usually 'in') }. " +
  "Reference upstream values in config strings with {{ trigger.<field> }}, {{ steps.<slug>.<field> }}, or {{ vars.<name> }}. " +
  "The graph is validated before saving; if invalid you get the problems to fix. New automations are created DISABLED — call automation_enable once the user approves.";

export const automationTools: InAppTool[] = [
  {
    name: "automation_list",
    description:
      "List the organization's automations (id, name, enabled, description, trigger). Use to answer 'what automations do I have?' or to find one to edit.",
    mutates: false,
    inputSchema: z.object({
      search: z.string().max(200).optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    run: async (caller, input) => {
      const p = input as { search?: string; limit?: number };
      const res = await caller.automation.automations.list({ search: p.search, limit: p.limit });
      return res.items.map((a) => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        description: a.description,
        triggerEventType: a.triggerEventType,
      }));
    },
  },
  {
    name: "automation_get",
    description:
      "Fetch one automation by id, including its full graph (nodes + edges + config). Use before editing, or to explain what a flow does.",
    mutates: false,
    inputSchema: z.object({ id: z.string().min(1) }),
    run: (caller, input) =>
      caller.automation.automations.getById({ id: (input as { id: string }).id }),
  },
  {
    name: "automation_list_node_types",
    description:
      "List every available automation node type with its kind (trigger/action), category, label, description, inputs/outputs, and configFields (key, type, required, options). ALWAYS call this before building or editing a graph so you use valid node types + config keys.",
    mutates: false,
    inputSchema: z.object({}),
    run: (caller) => caller.automation.nodeTypes.list(),
  },
  {
    name: "automation_list_trigger_events",
    description:
      "List the domain event types an Event Trigger can fire on, grouped by module, each with its description and the {{ trigger.* }} payload fields. Use to pick a trigger's config.eventType.",
    mutates: false,
    inputSchema: z.object({}),
    run: (caller) => caller.automation.eventTypes.list(),
  },
  {
    name: "automation_create",
    description: `Create a new automation from a full graph. FIRST call automation_list_node_types and (for an event trigger) automation_list_trigger_events. ${GRAPH_GUIDE}`,
    mutates: true,
    inputSchema: z.object({
      name: z.string().trim().min(1).max(120),
      description: z.string().max(2000).optional(),
      graph: automationGraphSchema,
    }),
    run: async (caller, input) => {
      const p = input as { name: string; description?: string; graph: AutomationGraph };
      await assertGraphValid(caller, p.graph);
      const created = await caller.automation.automations.create({
        name: p.name,
        description: p.description,
        graph: p.graph,
      });
      return { id: created.id, name: created.name, enabled: created.enabled };
    },
  },
  {
    name: "automation_update",
    description: `Update an existing automation's name, description, and/or full graph. Fetch it with automation_get first, edit the graph, then send the whole graph back. ${GRAPH_GUIDE}`,
    mutates: true,
    inputSchema: z.object({
      id: z.string().min(1),
      name: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(2000).optional(),
      graph: automationGraphSchema.optional(),
    }),
    run: async (caller, input) => {
      const p = input as {
        id: string;
        name?: string;
        description?: string;
        graph?: AutomationGraph;
      };
      if (p.graph) await assertGraphValid(caller, p.graph);
      const updated = await caller.automation.automations.update({
        id: p.id,
        name: p.name,
        description: p.description,
        graph: p.graph,
      });
      return { id: updated.id, name: updated.name, enabled: updated.enabled };
    },
  },
  {
    name: "automation_enable",
    description:
      "Enable or disable an automation. A new automation is created disabled; enable it once the user approves. Only an enabled automation runs.",
    mutates: true,
    inputSchema: z.object({ id: z.string().min(1), enabled: z.boolean() }),
    run: (caller, input) => {
      const p = input as { id: string; enabled: boolean };
      return caller.automation.automations.setEnabled({ id: p.id, enabled: p.enabled });
    },
  },
  {
    name: "automation_test",
    description:
      "Trigger a test run of an automation now (it must be valid). Returns a runId; poll automation_get_run to see the outcome. This actually executes the flow's actions, so use deliberately.",
    mutates: true,
    inputSchema: z.object({ id: z.string().min(1) }),
    run: (caller, input) =>
      caller.automation.automations.runNow({ id: (input as { id: string }).id }),
  },
  {
    name: "automation_get_run",
    description:
      "Fetch a run by id — its status (PENDING / RUNNING / SUCCEEDED / FAILED) and per-step results. Use after automation_test to report how the run went.",
    mutates: false,
    inputSchema: z.object({ runId: z.string().min(1) }),
    run: (caller, input) =>
      caller.automation.runs.getById({ id: (input as { runId: string }).runId }),
  },
];
