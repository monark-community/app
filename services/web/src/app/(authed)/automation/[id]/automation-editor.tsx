"use client";

import "@xyflow/react/dist/style.css";
import "./automation-editor.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  Box,
  Braces,
  ChevronDown,
  Clock,
  Copy,
  Database,
  Eraser,
  FlaskConical,
  GitBranch,
  History,
  Mail,
  Pencil,
  Play,
  Plus,
  Replace,
  Save,
  Search,
  Send,
  Shield,
  Sigma,
  Trash2,
  User,
  Variable,
  Webhook,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { toast } from "sonner";
import {
  validateGraph,
  HTTP_TRIGGER_TYPE,
  DATA_RECORD_TRIGGER_TYPE,
  dataRecordEventType,
  NODE_SLUG_RE,
  slugifyLabel,
  uniqueNodeSlug,
  type GraphIssue,
  type AutomationRunStepLog,
  type AutomationRunStepLogLevel,
  type AutomationSchedule,
} from "@monark/automation/contracts";
import { DragHandle } from "@monark/components/ui/drag-handle";
import {
  VariableInput,
  type VariableInputHandle,
  type ResolvedVariableToken,
  type VariableSuggestion,
} from "@monark/components/ui/variable-input";
import { ScheduleBuilder } from "./schedule-builder";
import { VariablePicker } from "./variable-picker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { edgeRunState, EDGE_STATE_STYLE, flowOutDotClass, type StepStatus } from "./run-viz";

// The built-in Set Variable node type — the editor reads its `name` config to
// list the workflow variables (`{{ vars.<name> }}`) a node can reference. Kept
// in step with the registry key in packages/automation/src/server/nodes/index.ts.
const SET_VARIABLE_TYPE = "automation.set-variable";

type NodeDescriptor = {
  type: string;
  module: string;
  kind: "trigger" | "action";
  category: string;
  label: string;
  description?: string;
  icon?: string;
  inputs: Array<{ id: string; label?: string }>;
  outputs: Array<{ id: string; label?: string }>;
  /** Fields this node's output carries, for the variable picker (see nodes.ts). */
  outputFields?: Array<{ key: string; type: string; description: string }>;
  configFields: Array<{
    key: string;
    label: string;
    type:
      | "text"
      | "textarea"
      | "number"
      | "boolean"
      | "select"
      | "event-type"
      | "data-model"
      | "user"
      | "secret"
      | "json"
      | "schedule";
    required?: boolean;
    placeholder?: string;
    help?: string;
    options?: Array<{ value: string; label: string }>;
  }>;
};

/** One payload field an event exposes, surfaced as a trigger output. */
type EventField = { key: string; type: string; description: string };

type NodePort = { id: string; label?: string };
type FieldPort = { key: string; label: string; type?: string };
type FlowNodeData = {
  descriptorType: string;
  label: string;
  category: string;
  /** Lucide icon name from the descriptor, for the node face + inspector. */
  icon?: string;
  kind: "trigger" | "action";
  inputs: NodePort[];
  outputs: NodePort[];
  fields: FieldPort[];
  /**
   * Stable, unique-within-the-graph handle used to reference this node's output
   * as `{{ steps.<slug>.field }}`. Assigned on creation (from the label) and
   * editable via the rename dialog ; persisted on the graph.
   */
  slug: string;
  /** Optional per-instance name shown on the node face. */
  name?: string;
  /** When true, the node has an "on error" output that fires on failure. */
  errorOutput: boolean;
  config: Record<string, unknown>;
};
type AppNode = Node<FlowNodeData>;

/**
 * The `triggerEventType` a trigger node maps to for run-matching. The Data
 * Record trigger maps its `operation` to the real `data-models.record-<op>`
 * event ; the generic Event Trigger uses its chosen `eventType`. Other triggers
 * (manual / http / schedule) fire off the bus, so they contribute no event here.
 */
function triggerEventTypeForNode(
  data: Pick<FlowNodeData, "descriptorType" | "config">,
): string | undefined {
  if (data.descriptorType === DATA_RECORD_TRIGGER_TYPE) {
    const op = data.config.operation;
    return typeof op === "string" && op ? dataRecordEventType(op) : undefined;
  }
  return typeof data.config.eventType === "string" ? data.config.eventType : undefined;
}

/**
 * One labelled control port : a React Flow handle pinned to the node's edge,
 * aligned with its label row. The row is the handle's positioning context, so
 * the dot lines up with its label. Used for a node's flow entry (left) and a
 * branch node's named outputs (grey, right) plus the error output.
 */
function PortRow({
  side,
  handleId,
  variant,
  label,
  title,
  dotClassName,
}: {
  side: "left" | "right";
  handleId: string;
  variant: "control" | "error";
  label: string;
  title: string;
  /** Run-driven dot color override (e.g. green once the output fired). */
  dotClassName?: string;
}) {
  return (
    <div className="relative flex items-center py-0.5">
      <Handle
        id={handleId}
        type={side === "left" ? "target" : "source"}
        position={side === "left" ? Position.Left : Position.Right}
        title={title}
        className={cn(
          "!h-2.5 !w-2.5 !border-2 !border-background",
          dotClassName ?? (variant === "error" ? "!bg-destructive" : "!bg-muted-foreground"),
        )}
      />
      <span
        className={cn(
          "whitespace-nowrap text-[11px]",
          side === "left" ? "pl-3 pr-2" : "ml-auto pl-2 pr-3",
          variant === "error" ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Single custom node renderer. The header carries the whole execution-flow spine
 * (run order) : an entry handle on the left for every non-trigger node, and the
 * flow outputs on the right — a bare continue handle for a single-output node,
 * or labelled rows (On success / On error, or a branch node's named outs) when
 * there are several. The body is reserved for data ports : one labelled input
 * port per config variable on the left (wire an upstream node's output into any
 * variable, or type it in the config panel), with the right column held for
 * future data-output ports.
 */
function FlowNode({ id, data, selected }: NodeProps) {
  const t = useTranslations("automation.editor");
  const viz = useContext(RunVizContext);
  const runStatus = viz.nodeStatus.get(id);
  const activeOut = viz.activeHandles.get(id);
  const isActive = viz.activeNodeId === id;
  const d = data as unknown as FlowNodeData;
  const isTrigger = d.kind === "trigger";
  const flowInId = d.inputs[0]?.id ?? "in";
  const baseOutputs = d.outputs.length > 0 ? d.outputs : [{ id: "out" }];
  // An enabled error output adds a second, red output that fires on failure.
  const outputs: NodePort[] = d.errorOutput ? [...baseOutputs, { id: "error" }] : baseOutputs;
  const singleOut = outputs.length === 1;
  const flowOutId = outputs[0]?.id ?? "out";
  // Face title : the instance name if set, else the node-type label. The
  // subtitle then shows the trigger's chosen event (so the graph reads at a
  // glance), the node type when renamed, or the palette category.
  const name = d.name?.trim();
  const title = name || d.label;
  // Show the raw dotted event type (developer-facing event-bus id), not a prose
  // description ; the Data Record trigger derives it from model + operation.
  const eventLabel = triggerEventTypeForNode(d) ?? "";
  const Icon = nodeIcon({ icon: d.icon, category: d.category });
  return (
    <div
      className={cn(
        "min-w-[190px] rounded-md border bg-background text-xs shadow-sm transition",
        // Live run visualization takes precedence over the selection ring.
        isActive
          ? "border-amber-400 ring-2 ring-amber-400/70 animate-pulse"
          : runStatus === "SUCCEEDED"
            ? "border-emerald-500 ring-2 ring-emerald-500/50"
            : runStatus === "FAILED"
              ? "border-destructive ring-2 ring-destructive/50"
              : runStatus === "SKIPPED"
                ? "border-border opacity-50"
                : selected
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-border",
      )}
    >
      <div className="relative px-3 py-2">
        {!isTrigger && d.inputs.length > 0 && (
          <Handle
            id={flowInId}
            type="target"
            position={Position.Left}
            title={t("portFlowHint")}
            className={cn(
              "!h-2.5 !w-2.5 !border-2 !border-background",
              // The dot greens once this node has RECEIVED its input (it ran) —
              // matching the incoming edge. A node after a Delay stays grey
              // through the countdown, then greens when it runs. Red if it
              // failed ; muted while pending / at rest.
              runStatus === "SUCCEEDED" || runStatus === "RUNNING"
                ? "!bg-emerald-500"
                : runStatus === "FAILED"
                  ? "!bg-destructive"
                  : "!bg-muted-foreground",
            )}
          />
        )}
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium leading-tight">{title}</div>
            {/* Only an event trigger shows an event line ; manual / HTTP
                triggers have no event to select. */}
            {isTrigger && d.fields.some((f) => f.type === "event-type") && (
              <div className="truncate text-[10px] text-muted-foreground">
                {eventLabel || t("triggerNoEvent")}
              </div>
            )}
          </div>
          {/* Flow (control) outputs live in the header — the run-order spine. A
              single implicit "continue" is a bare handle pinned to the header's
              right edge ; multiple outputs (On success / On error, or a branch
              node's named outs) stack as labelled rows. `-mr-3` cancels the
              header padding so each row's handle sits on the node's edge. */}
          {singleOut ? (
            <Handle
              id={flowOutId}
              type="source"
              position={Position.Right}
              title={t("portFlowHint")}
              className={cn(
                "!h-2.5 !w-2.5 !border-2 !border-background",
                flowOutDotClass(runStatus, flowOutId, activeOut, false),
              )}
            />
          ) : (
            <div className="-mr-3 flex shrink-0 flex-col">
              {outputs.map((o) => {
                const isError = o.id === "error";
                return (
                  <PortRow
                    key={o.id}
                    side="right"
                    handleId={o.id}
                    variant={isError ? "error" : "control"}
                    label={isError ? t("errorPort") : (o.label ?? t("outDefault"))}
                    title={isError ? t("errorPortHint") : t("portFlowHint")}
                    dotClassName={flowOutDotClass(runStatus, o.id, activeOut, isError)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Local, ephemeral graph ids (node / edge keys). `crypto.randomUUID` is only
// defined in a secure context, so it throws on a phone hitting the LAN dev
// server over http — which silently broke "add node". Fall back to a
// Math.random id (these are client-only keys, not security tokens ; same
// pattern as the webhook subscription-picker's local ids).
function genId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rand}`;
}

// A data-link edge (into a `field:<key>` target handle) carries a node's whole
// output into a config field ; style it apart from a control-flow edge (a
// distinct primary stroke) so the two kinds of connection read differently.
function styleEdge(edge: Edge): Edge {
  // Every edge is control flow now (data moves via `{{ }}` references, not
  // wires) and uses the custom `automationEdge` renderer (click-to-detach). At
  // rest edges are solid ; the marching-dash animation is reserved for an
  // in-progress run (see `edgeRunState` / `automation-edge-flow`).
  return { ...edge, type: "automationEdge" };
}

// Build a node's face data from a descriptor — shared by "add node" and
// "replace node". Config resets to empty. The caller supplies the (already
// unique) slug, since uniqueness needs the rest of the graph.
function descriptorToNodeData(desc: NodeDescriptor, slug: string): FlowNodeData {
  return {
    descriptorType: desc.type,
    label: desc.label,
    category: desc.category,
    icon: desc.icon,
    kind: desc.kind,
    inputs: desc.inputs,
    outputs: desc.outputs,
    fields: desc.configFields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
    slug,
    errorOutput: false,
    config: {},
  };
}

// Rewrite legacy node-id references (`{{ <nodeId>… }}`) in a config string to the
// readable `{{ steps.<slug>… }}` form, using an id -> slug map. The first path
// segment is the node id ; `trigger` / `vars` / `steps` and unknown ids (no slug)
// pass through untouched. Used once on load to migrate stored graphs.
function rewriteIdRefsToSlugs(value: string, slugById: Map<string, string>): string {
  return value.replace(/\{\{\s*([\w-]+)/g, (whole, id: string) => {
    const slug = slugById.get(id);
    return slug ? whole.replace(id, `steps.${slug}`) : whole;
  });
}

// Rewrite `{{ steps.<oldSlug>… }}` references to a new slug across a config, when
// a node's slug is edited — so references to it don't break. Slugs are
// `[a-z0-9_]`, so they need no regex escaping.
function rewriteSlugRefs(
  config: Record<string, unknown>,
  oldSlug: string,
  newSlug: string,
): Record<string, unknown> {
  const re = new RegExp(`(\\{\\{\\s*steps\\.)${oldSlug}(?=[.\\s}])`, "g");
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === "string") {
      const nv = v.replace(re, `$1${newSlug}`);
      if (nv !== v) changed = true;
      out[k] = nv;
    } else out[k] = v;
  }
  return changed ? out : config;
}

// Whether an edge survives replacing node `nodeId` with `desc`. An edge not
// touching the node always survives ; a touching edge survives only if the new
// node still has the handle it uses — a `field:<key>` input whose key exists, a
// flow input, or an output handle. Incompatible wires (a dropped branch output,
// a config field the new node lacks, the old error handle) are pruned. This is
// what "keeps compatible connections" means.
function edgeSurvivesReplace(e: Edge, nodeId: string, desc: NodeDescriptor): boolean {
  if (e.source !== nodeId && e.target !== nodeId) return true;
  if (e.target === nodeId) {
    const h = e.targetHandle;
    if (typeof h === "string" && h.startsWith("field:")) {
      return desc.configFields.some((f) => `field:${f.key}` === h);
    }
    return h == null ? desc.inputs.length > 0 : desc.inputs.some((i) => i.id === h);
  }
  const h = e.sourceHandle;
  return h == null ? desc.outputs.length > 0 : desc.outputs.some((o) => o.id === h);
}

// The ids of every node with a directed path INTO `target` (its ancestors), by
// walking edges backwards. These are the nodes guaranteed to have run before the
// target, so their outputs are in scope for its `{{ ... }}` references.
function ancestorNodeIds(target: string, edges: Edge[]): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const list = incoming.get(e.target);
    if (list) list.push(e.source);
    else incoming.set(e.target, [e.source]);
  }
  const seen = new Set<string>();
  const stack = [...(incoming.get(target) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    for (const s of incoming.get(id) ?? []) stack.push(s);
  }
  return seen;
}

// One `{{ path }}` reference the author can drop into a config field, and a
// group of them by source (the trigger, or an upstream node).
type VarItem = { label: string; token: string; hint?: string };
type VarGroup = { id: string; title: string; items: VarItem[] };

// Lets the custom edge remove itself from the parent's controlled edge state
// (React Flow's own setEdges won't stick in a controlled flow).
const EdgeActionsContext = createContext<{
  canEdit: boolean;
  deleteEdge: (id: string) => void;
  label: string;
}>({ canEdit: false, deleteEdge: () => {}, label: "Remove connection" });

// Inspector (right panel) resizable width, persisted per browser.
const INSPECTOR_WIDTH_KEY = "automation-inspector-width";
const INSPECTOR_MIN_W = 288;
const INSPECTOR_MAX_W = 640;
const INSPECTOR_DEFAULT_W = 340;

// Live run visualization: per-node status as a test run's steps reveal, the
// currently-executing ("active") node, and per-node which output handles the
// node activated (its taken branch). Nodes + edges read this to light up. The
// pure status→style mapping lives in `./run-viz` (unit-tested).
const RunVizContext = createContext<{
  nodeStatus: Map<string, StepStatus>;
  activeNodeId: string | null;
  activeHandles: Map<string, Set<string>>;
}>({ nodeStatus: new Map(), activeNodeId: null, activeHandles: new Map() });

/**
 * Edge renderer with a click-to-detach control: selecting the edge (click or
 * tap — works without a keyboard) reveals a ✕ at its midpoint that removes it.
 * The Delete/Backspace key also works (see `deleteKeyCode`), but this is the
 * discoverable, touch-friendly affordance.
 */
function AutomationEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const { canEdit, deleteEdge, label } = useContext(EdgeActionsContext);
  const viz = useContext(RunVizContext);
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  // Reflect the run: pending / pulling / transmitted / error (see edgeRunState).
  // `idle` keeps the base style so a resting graph is unchanged.
  const state = edgeRunState(source, target, viz);
  const stateStyle = state === "idle" ? null : EDGE_STATE_STYLE[state];
  const edgeStyle = stateStyle ? { ...style, ...stateStyle.style } : style;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={edgeStyle}
        className={cn(stateStyle?.flow && "automation-edge-flow")}
      />
      {canEdit && selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan pointer-events-auto absolute flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:border-destructive hover:text-destructive"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onClick={(e) => {
              e.stopPropagation();
              deleteEdge(id);
            }}
            aria-label={label}
            title={label}
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

// The canvas state serialized into the persisted graph shape. Shared by save
// and the dirty-check so an unsaved-changes comparison never drifts from what
// actually gets written.
function toGraphPayload(nodes: AppNode[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.descriptorType,
      position: n.position,
      config: n.data.config,
      ...(n.data.slug ? { slug: n.data.slug } : {}),
      ...(n.data.name?.trim() ? { name: n.data.name.trim() } : {}),
      ...(n.data.errorOutput ? { errorOutput: true } : {}),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
  };
}

export function AutomationEditor(props: {
  automationId: string;
  canEdit: boolean;
  canRun: boolean;
  canManage: boolean;
}) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  );
}

function EditorInner({
  automationId,
  canEdit,
  canRun,
  canManage,
}: {
  automationId: string;
  canEdit: boolean;
  canRun: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("automation.editor");
  const utils = trpc.useUtils();
  const isMobile = useIsMobile();
  const router = useRouter();

  const automationQuery = trpc.automation.automations.getById.useQuery(
    { id: automationId },
    { refetchOnWindowFocus: false },
  );
  const nodeTypesQuery = trpc.automation.nodeTypes.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const eventTypesQuery = trpc.automation.eventTypes.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const modelsQuery = trpc.dataModels.models.list.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false },
  );
  const membersQuery = trpc.automation.members.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  // Names only (never values) for the `secret` config-field picker.
  const secretsQuery = trpc.automation.secrets.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const descriptors = useMemo(
    () => (nodeTypesQuery.data?.nodes ?? []) as NodeDescriptor[],
    [nodeTypesQuery.data],
  );
  const descriptorByType = useMemo(
    () => new Map(descriptors.map((d) => [d.type, d])),
    [descriptors],
  );
  const eventTypeOptions = useMemo(
    () =>
      // Options show the dotted event type id (e.g. "automation.created"), not the
      // verbose registry description : these are developer-facing event-bus events,
      // and the concise id reads better in the "when this event fires" picker.
      (eventTypesQuery.data?.groups ?? []).flatMap((g) =>
        g.events.map((e) => ({ value: e.type, label: e.type })),
      ),
    [eventTypesQuery.data],
  );
  // event type -> its exposed fields (payload + common base), so the trigger's
  // inspector can list what `{{ trigger.* }}` values the flow has to work with.
  const eventFieldsByType = useMemo(() => {
    const map = new Map<string, EventField[]>();
    for (const g of eventTypesQuery.data?.groups ?? []) {
      for (const e of g.events) map.set(e.type, e.fields);
    }
    return map;
  }, [eventTypesQuery.data]);
  const modelOptions = useMemo(
    () => (modelsQuery.data?.items ?? []).map((m) => ({ value: m.key, label: m.name })),
    [modelsQuery.data],
  );
  const memberOptions = useMemo(
    () =>
      (membersQuery.data?.members ?? []).map((m) => ({
        value: m.id,
        label: m.displayName ?? m.email,
      })),
    [membersQuery.data],
  );
  const secretOptions = useMemo(() => secretsQuery.data?.names ?? [], [secretsQuery.data]);

  const [nodes, setNodes] = useState<AppNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Resizable Inspector width (desktop) : drag its left edge ; persisted.
  const [panelWidth, setPanelWidth] = useState(INSPECTOR_DEFAULT_W);
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    const raw = window.localStorage.getItem(INSPECTOR_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) setPanelWidth(Math.min(INSPECTOR_MAX_W, Math.max(INSPECTOR_MIN_W, n)));
  }, []);
  const startPanelResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setResizing(true);
      const startX = e.clientX;
      const startW = panelWidth;
      const onMove = (ev: PointerEvent) => {
        // Panel is on the right, so dragging its left edge leftward widens it.
        const w = Math.min(
          INSPECTOR_MAX_W,
          Math.max(INSPECTOR_MIN_W, startW + (startX - ev.clientX)),
        );
        setPanelWidth(w);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setResizing(false);
        setPanelWidth((w) => {
          window.localStorage.setItem(INSPECTOR_WIDTH_KEY, String(w));
          return w;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [panelWidth],
  );

  // Add-node modal (searchable palette) + its keyboard shortcut ("N").
  const [addOpen, setAddOpen] = useState(false);
  // Right-click node menu (position + target), and the dialogs it opens : rename
  // and replace (replace confirms before applying). Node name is edited only
  // here now — the inspector no longer carries a name field.
  const [nodeMenu, setNodeMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [replacePending, setReplacePending] = useState<{
    nodeId: string;
    desc: NodeDescriptor;
  } | null>(null);
  useEffect(() => {
    if (!nodeMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNodeMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodeMenu]);
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setAddOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit]);

  // ── Live test-run visualization ───────────────────────────
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);

  const activeRunQuery = trpc.automation.runs.getById.useQuery(
    { id: activeRunId ?? "" },
    {
      enabled: !!activeRunId,
      // Poll while the run is still working (PENDING covers a delay resume).
      refetchInterval: (q) => {
        const s = q.state.data?.status;
        return s === "PENDING" || s === "RUNNING" ? 800 : false;
      },
    },
  );
  const runSteps = useMemo(
    () => (activeRunQuery.data?.steps ?? []).slice().sort((a, b) => a.sequence - b.sequence),
    [activeRunQuery.data],
  );
  const runStatus = activeRunQuery.data?.status;
  const runActive = runStatus === "PENDING" || runStatus === "RUNNING";

  // Reveal steps one at a time (≈450ms) up to however many have arrived, so even
  // a run that finished in one poll animates step-by-step.
  useEffect(() => {
    if (revealed >= runSteps.length) return;
    const timer = setTimeout(() => setRevealed((r) => r + 1), 450);
    return () => clearTimeout(timer);
  }, [revealed, runSteps.length]);

  const revealedSteps = useMemo(() => runSteps.slice(0, revealed), [runSteps, revealed]);
  const runViz = useMemo(() => {
    const nodeStatus = new Map<string, StepStatus>();
    const activeHandles = new Map<string, Set<string>>();
    for (const s of revealedSteps) {
      nodeStatus.set(s.nodeId, s.status as StepStatus);
      // Which output handles the node fired (its taken branch), so an output dot
      // only greens for the handle that actually carried a value.
      activeHandles.set(s.nodeId, new Set(s.activeHandles ?? []));
    }
    // The frontier node "pulses" while more steps are still coming.
    const frontier = revealedSteps[revealedSteps.length - 1];
    const activeNodeId =
      frontier && (revealed < runSteps.length || runActive) ? frontier.nodeId : null;
    return { nodeStatus, activeNodeId, activeHandles };
  }, [revealedSteps, revealed, runSteps.length, runActive]);
  // Unsaved-changes tracking : `baseline` is the serialized graph as last
  // loaded/saved ; `dirty` is set whenever the canvas diverges from it.
  const baselineRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  // Hydrate the canvas once the automation + node descriptors are loaded.
  useEffect(() => {
    if (initialized || !automationQuery.data || descriptors.length === 0) return;
    const graph = automationQuery.data.graph;
    // Assign every node a stable, unique slug (reuse a stored one, else derive
    // from its name/label + de-duplicate) and build id -> slug, so legacy
    // references can be rewritten to the readable `{{ steps.<slug> }}` form.
    const slugById = new Map<string, string>();
    const takenSlugs = new Set<string>();
    for (const n of graph.nodes) {
      const desc = descriptorByType.get(n.type);
      const desired =
        n.slug && NODE_SLUG_RE.test(n.slug)
          ? n.slug
          : slugifyLabel(n.name?.trim() || desc?.label || n.type);
      const slug = uniqueNodeSlug(desired, takenSlugs);
      takenSlugs.add(slug);
      slugById.set(n.id, slug);
    }
    // Migrate legacy per-field data wires to `{{ }}` references: for each edge
    // into a `field:<key>` port, write a reference into that field (unless the
    // author already put an expression there) and drop the edge. The engine
    // still resolves any un-migrated `field:` edge, so an old graph runs the same
    // until the next save persists the reference form.
    const isField = (h: string | null | undefined): h is string =>
      typeof h === "string" && h.startsWith("field:");
    const patchedConfig = new Map<string, Record<string, unknown>>();
    for (const e of graph.edges) {
      if (!isField(e.targetHandle)) continue;
      const target = graph.nodes.find((n) => n.id === e.target);
      if (!target) continue;
      const key = e.targetHandle.slice("field:".length);
      const cfg = patchedConfig.get(e.target) ?? { ...(target.config ?? {}) };
      const existing = cfg[key];
      if (typeof existing !== "string" || !existing.includes("{{")) {
        const srcOut = descriptorByType.get(
          graph.nodes.find((n) => n.id === e.source)?.type ?? "",
        )?.outputFields;
        const srcSlug = slugById.get(e.source);
        const ref = srcSlug ? `steps.${srcSlug}` : e.source;
        cfg[key] =
          srcOut?.length === 1 && srcOut[0]?.key === "value"
            ? `{{ ${ref}.value }}`
            : `{{ ${ref} }}`;
      }
      patchedConfig.set(e.target, cfg);
    }
    // Rewrite any legacy `{{ <nodeId>… }}` reference in a config to its readable
    // slug form (the engine still resolves the id form, so this is a display
    // upgrade that self-persists on the next save).
    const migrateRefs = (config: Record<string, unknown>): Record<string, unknown> => {
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(config)) {
        if (typeof v === "string") {
          const nv = rewriteIdRefsToSlugs(v, slugById);
          if (nv !== v) changed = true;
          out[k] = nv;
        } else out[k] = v;
      }
      return changed ? out : config;
    };
    setNodes(
      graph.nodes.map((n) => {
        const desc = descriptorByType.get(n.type);
        const configFields = desc?.configFields ?? [];
        return {
          id: n.id,
          type: "automationNode",
          position: n.position,
          data: {
            descriptorType: n.type,
            label: desc?.label ?? n.type,
            category: desc?.category ?? "",
            icon: desc?.icon,
            kind: desc?.kind ?? "action",
            inputs: desc?.inputs ?? [{ id: "in" }],
            outputs: desc?.outputs ?? [{ id: "out" }],
            fields: configFields.map((f) => ({ key: f.key, label: f.label, type: f.type })),
            slug: slugById.get(n.id) ?? slugifyLabel(desc?.label ?? n.type),
            name: n.name,
            errorOutput: n.errorOutput ?? false,
            config: migrateRefs(patchedConfig.get(n.id) ?? n.config ?? {}),
          },
        } satisfies AppNode;
      }),
    );
    setEdges(
      graph.edges
        .filter((e) => !isField(e.targetHandle))
        .map((e) =>
          styleEdge({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
          }),
        ),
    );
    setEnabled(automationQuery.data.enabled);
    setInitialized(true);
  }, [automationQuery.data, descriptors, descriptorByType, initialized]);

  // Capture the loaded graph as the baseline, then flag `dirty` whenever the
  // canvas diverges from it (drag, edit, wire, rename, delete).
  useEffect(() => {
    if (!initialized) return;
    const current = JSON.stringify(toGraphPayload(nodes, edges));
    if (baselineRef.current === null) {
      baselineRef.current = current;
      setDirty(false);
    } else {
      setDirty(current !== baselineRef.current);
    }
  }, [initialized, nodes, edges]);

  // Native guard for tab-close / refresh while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds) as AppNode[]),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (conn: Connection) => setEdges((eds) => addEdge(styleEdge({ ...conn, id: genId("e") }), eds)),
    [],
  );
  const deleteEdge = useCallback(
    (id: string) => setEdges((eds) => eds.filter((e) => e.id !== id)),
    [],
  );

  const addNode = useCallback((desc: NodeDescriptor) => {
    const id = genId("n");
    setNodes((nds) => {
      const slug = uniqueNodeSlug(slugifyLabel(desc.label), new Set(nds.map((n) => n.data.slug)));
      return [
        ...nds,
        {
          id,
          type: "automationNode",
          position: { x: 120 + nds.length * 40, y: 80 + nds.length * 30 },
          data: descriptorToNodeData(desc, slug),
        },
      ];
    });
    setSelectedId(id);
  }, []);

  // Rename a node by id (from the right-click "Rename" dialog) : the display name
  // (empty clears the custom label) and the reference slug. When the slug
  // changes, rewrite `{{ steps.<oldSlug> }}` references in every other node so
  // they keep pointing at this node.
  const renameNode = useCallback((nodeId: string, name: string, slug: string) => {
    setNodes((nds) => {
      const oldSlug = nds.find((n) => n.id === nodeId)?.data.slug;
      const slugChanged = oldSlug != null && slug !== oldSlug;
      return nds.map((n) => {
        if (n.id === nodeId) return { ...n, data: { ...n.data, name, slug } };
        if (!slugChanged) return n;
        const cfg = rewriteSlugRefs(n.data.config, oldSlug, slug);
        return cfg === n.data.config ? n : { ...n, data: { ...n.data, config: cfg } };
      });
    });
  }, []);

  // Delete a node by id (right-click "Delete") along with every edge touching it.
  const deleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId((sel) => (sel === nodeId ? null : sel));
  }, []);

  // Replace a node's type in place (right-click "Replace", after confirm) : keep
  // its id + position, reset config/name, and prune edges the new node can't
  // carry.
  const replaceNode = useCallback(
    (nodeId: string, desc: NodeDescriptor) => {
      const kept = edges.filter((e) => edgeSurvivesReplace(e, nodeId, desc));
      setNodes((nds) =>
        nds.map((n) =>
          // Keep the node's slug across a type swap — references to it stay valid.
          n.id === nodeId ? { ...n, data: descriptorToNodeData(desc, n.data.slug) } : n,
        ),
      );
      setEdges(kept);
      setSelectedId(nodeId);
    },
    [edges],
  );

  const updateSelectedConfig = useCallback(
    (key: string, value: unknown) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedId
            ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } }
            : n,
        ),
      );
    },
    [selectedId],
  );

  // Toggle the node's error output. Turning it off drops any edge leaving its
  // `error` handle (that branch no longer exists).
  const toggleSelectedErrorOutput = useCallback(
    (on: boolean) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, errorOutput: on } } : n)),
      );
      if (!on) {
        setEdges((eds) =>
          eds.filter((e) => !(e.source === selectedId && e.sourceHandle === "error")),
        );
      }
    },
    [selectedId],
  );

  // Reject nonsensical wires : self-loops, and any legacy field-port target
  // (data moves via `{{ }}` references now, not per-field wires).
  const isValidConnection = useCallback((conn: Connection | Edge) => {
    if (conn.source === conn.target) return false;
    if (typeof conn.targetHandle === "string" && conn.targetHandle.startsWith("field:")) {
      return false;
    }
    return true;
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const saveMutation = trpc.automation.automations.update.useMutation({
    onSuccess: () => {
      toast.success(t("saved"));
      utils.automation.automations.getById.invalidate({ id: automationId });
    },
    onError: (err) => toast.error(t("saveError") + ` (${err.message})`),
  });
  const runNow = trpc.automation.automations.runNow.useMutation({
    onSuccess: (data) => {
      toast.success(t("runQueued"));
      // Start the live visualization: reset + point at the new run.
      setRevealed(0);
      setActiveRunId(data.runId);
    },
    onError: (err) => toast.error(t("runError") + ` (${err.message})`),
  });
  const setEnabledMutation = trpc.automation.automations.setEnabled.useMutation({
    onSuccess: () => utils.automation.automations.getById.invalidate({ id: automationId }),
    onError: (err) => toast.error(err.message),
  });

  // Mint an HTTP-trigger secret server-side and store it on the selected node's
  // config (persisted on the next save).
  const newHttpSecret = trpc.automation.automations.newHttpSecret.useMutation();
  const generateHttpSecret = useCallback(async () => {
    try {
      const { secret } = await newHttpSecret.mutateAsync();
      updateSelectedConfig("secret", secret);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [newHttpSecret, updateSelectedConfig]);

  const handleSave = useCallback(() => {
    const graph = toGraphPayload(nodes, edges);
    // The saved graph becomes the new clean baseline once the write lands.
    const snapshot = JSON.stringify(graph);
    const triggerNode = nodes.find((n) => n.data.kind === "trigger");
    const triggerEventType = triggerNode ? triggerEventTypeForNode(triggerNode.data) : undefined;
    saveMutation.mutate(
      {
        id: automationId,
        graph,
        ...(triggerEventType ? { triggerEventType } : {}),
      },
      {
        onSuccess: () => {
          baselineRef.current = snapshot;
          setDirty(false);
        },
      },
    );
  }, [nodes, edges, automationId, saveMutation]);

  // Test run : a run executes the *saved* automation, so persist any pending
  // edits first — otherwise the test wouldn't include just-added nodes/wires.
  const handleTestRun = useCallback(async () => {
    if (canEdit && dirty) {
      const graph = toGraphPayload(nodes, edges);
      const snapshot = JSON.stringify(graph);
      const triggerNode = nodes.find((n) => n.data.kind === "trigger");
      const triggerEventType = triggerNode ? triggerEventTypeForNode(triggerNode.data) : undefined;
      try {
        await saveMutation.mutateAsync({
          id: automationId,
          graph,
          ...(triggerEventType ? { triggerEventType } : {}),
        });
        baselineRef.current = snapshot;
        setDirty(false);
      } catch {
        return; // save failed (toasted) ; don't run a stale graph
      }
    }
    runNow.mutate({ id: automationId });
  }, [canEdit, dirty, nodes, edges, automationId, saveMutation, runNow]);

  // Clear run : drop the live visualization overlay so nodes return to their
  // resting state (no statuses, no per-node input/output, log panel closed).
  const clearRun = useCallback(() => {
    setActiveRunId(null);
    setRevealed(0);
  }, []);

  // Leaving via the Back button : confirm first if there are unsaved edits.
  const handleBack = useCallback(() => {
    if (dirty) setLeaveOpen(true);
    else router.push("/automation");
  }, [dirty, router]);

  const nodeTypes = useMemo(() => ({ automationNode: FlowNode }), []);
  const edgeTypes = useMemo(() => ({ automationEdge: AutomationEdge }), []);
  const edgeActions = useMemo(
    () => ({ canEdit, deleteEdge, label: t("deleteEdge") }),
    [canEdit, deleteEdge, t],
  );
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const selectedDescriptor = selectedNode
    ? descriptorByType.get(selectedNode.data.descriptorType)
    : undefined;
  // Right-click dialog targets. The rename dialog seeds from the node's current
  // name + type label ; the replace palette offers same-kind node types (so a
  // flow keeps exactly one trigger) other than the node's current type.
  const renameNodeInst = renameTarget ? (nodes.find((n) => n.id === renameTarget) ?? null) : null;
  const replaceNodeInst = replaceTarget
    ? (nodes.find((n) => n.id === replaceTarget) ?? null)
    : null;
  const replaceCandidates = replaceNodeInst
    ? descriptors.filter(
        (d) =>
          d.kind === replaceNodeInst.data.kind && d.type !== replaceNodeInst.data.descriptorType,
      )
    : descriptors;

  // Variables the selected (non-trigger) node can reference, grouped by source :
  // the trigger's event fields, then each upstream node's output (whole output
  // always, plus concrete keys once a test run has produced them). Surfaced in
  // the inspector so you don't have to open the trigger / upstream nodes to
  // recall what `{{ ... }}` you can pull in.
  const variableGroups = useMemo<VarGroup[]>(() => {
    if (!selectedNode || selectedNode.data.kind === "trigger") return [];
    const ancestors = ancestorNodeIds(selectedNode.id, edges);
    const groups: VarGroup[] = [];
    const trigger = nodes.find((n) => n.data.kind === "trigger");
    if (trigger && ancestors.has(trigger.id)) {
      const evType = triggerEventTypeForNode(trigger.data) ?? "";
      const items: VarItem[] = (eventFieldsByType.get(evType) ?? []).map((f) => ({
        label: f.key,
        token: `{{ trigger.${f.key} }}`,
        hint: f.type,
      }));
      if (trigger.data.descriptorType === HTTP_TRIGGER_TYPE) {
        items.push({ label: "body", token: "{{ trigger.body }}", hint: t("varBodyHint") });
      }
      if (items.length > 0) {
        const desc = descriptorByType.get(trigger.data.descriptorType);
        groups.push({
          id: "trigger",
          title: trigger.data.name?.trim() || desc?.label || t("varTrigger"),
          items,
        });
      }
    }
    for (const n of nodes) {
      if (n.data.kind === "trigger" || !ancestors.has(n.id)) continue;
      const desc = descriptorByType.get(n.data.descriptorType);
      const ref = `steps.${n.data.slug}`;
      const items: VarItem[] = [
        { label: t("varWholeOutput"), token: `{{ ${ref} }}`, hint: desc?.label },
      ];
      // Declared output fields — available without a test run (the node's schema).
      const seen = new Set<string>();
      for (const f of desc?.outputFields ?? []) {
        items.push({ label: f.key, token: `{{ ${ref}.${f.key} }}`, hint: f.type });
        seen.add(f.key);
      }
      // Plus any extra keys a test run actually produced that weren't declared.
      const out = runSteps.find((s) => s.nodeId === n.id)?.output;
      if (out != null && typeof out === "object" && !Array.isArray(out)) {
        for (const key of Object.keys(out as Record<string, unknown>)) {
          if (!seen.has(key)) items.push({ label: key, token: `{{ ${ref}.${key} }}` });
        }
      }
      groups.push({ id: n.id, title: n.data.name?.trim() || desc?.label || n.data.label, items });
    }
    // Workflow variables : names set by any upstream Set Variable node, offered
    // as `{{ vars.<name> }}`. Run-global (distinct from per-step outputs), so a
    // value set on a branch is referenceable after the branches converge.
    const varNames = new Set<string>();
    for (const n of nodes) {
      if (n.data.descriptorType !== SET_VARIABLE_TYPE || !ancestors.has(n.id)) continue;
      const name = typeof n.data.config.name === "string" ? n.data.config.name.trim() : "";
      if (name) varNames.add(name);
    }
    if (varNames.size > 0) {
      groups.push({
        id: "vars",
        title: t("varWorkflowVars"),
        items: [...varNames].map((name) => ({
          label: name,
          token: `{{ vars.${name} }}`,
          hint: t("varWorkflowVarHint"),
        })),
      });
    }
    return groups;
  }, [selectedNode, nodes, edges, eventFieldsByType, descriptorByType, runSteps, t]);

  // Label a `{{ }}` token for the chip renderer inside config fields: a friendly
  // step name + path (`{{ steps.find_record.id }}` → "Find record.id"), the
  // `trigger` / `vars` path as-is, and an "invalid" flag when a `steps.<slug>`
  // reference points at a node that no longer exists.
  const resolveToken = useCallback(
    (raw: string): ResolvedVariableToken => {
      const inner = raw
        .replace(/^\{\{\s*/, "")
        .replace(/\s*\}\}$/, "")
        .trim();
      const nameOf = (node: AppNode, fallback: string) =>
        node.data.name?.trim() || descriptorByType.get(node.data.descriptorType)?.label || fallback;
      const stepMatch = /^steps\.([\w-]+)(?:\.(.+))?$/.exec(inner);
      if (stepMatch) {
        const slug = stepMatch[1];
        const rest = stepMatch[2];
        const node = nodes.find((n) => n.data.slug === slug);
        if (!node) return { label: inner, invalid: true, title: `${raw} — no such step` };
        const name = nameOf(node, slug ?? inner);
        return { label: rest ? `${name}.${rest}` : name, title: raw };
      }
      if (/^(trigger|vars)(\.|$)/.test(inner)) return { label: inner, title: raw };
      // Legacy `{{ <nodeId>… }}` (pre-slug graphs) — resolve by id if it survives.
      const idMatch = /^([\w-]+)(?:\.(.+))?$/.exec(inner);
      if (idMatch) {
        const node = nodes.find((n) => n.id === idMatch[1]);
        if (node) {
          const name = nameOf(node, idMatch[1] ?? inner);
          return { label: idMatch[2] ? `${name}.${idMatch[2]}` : name, title: raw };
        }
      }
      return { label: inner, title: raw };
    },
    [nodes, descriptorByType],
  );
  // The selected node's step from the run being visualized, so the inspector
  // can show that node's actual input / output / result. Cleared when the run
  // overlay is closed (activeRunId reset).
  const selectedStep = useMemo(
    () => (activeRunId ? (runSteps.find((s) => s.nodeId === selectedId) ?? null) : null),
    [activeRunId, runSteps, selectedId],
  );

  // Pre-flight validation (shared with the server's runNow guard). Only once
  // descriptors are loaded, else every node reads as an unknown type.
  const issues = useMemo(() => {
    if (!initialized || descriptors.length === 0) return [] as GraphIssue[];
    return validateGraph(toGraphPayload(nodes, edges), (type) => descriptorByType.get(type));
  }, [initialized, descriptors, nodes, edges, descriptorByType]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const hasErrors = errorCount > 0;
  // Config fields on the selected node flagged by validation, so the panel can
  // mark exactly which required inputs are missing.
  const selectedErrorKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const i of issues) {
      if (i.nodeId === selectedId && i.fieldKey) keys.add(i.fieldKey);
    }
    return keys;
  }, [issues, selectedId]);

  // Render a validation issue as a human line (node + field names resolved from
  // the loaded descriptors), mirroring the server's `describeIssue`.
  const issueText = useCallback(
    (issue: GraphIssue): string => {
      const node = nodes.find((n) => n.id === issue.nodeId);
      const desc = node ? descriptorByType.get(node.data.descriptorType) : undefined;
      const nodeLabel = node?.data.name?.trim() || desc?.label || node?.data.label || t("aNode");
      const fieldLabel =
        desc?.configFields.find((f) => f.key === issue.fieldKey)?.label ?? issue.fieldKey ?? "";
      switch (issue.code) {
        case "no-trigger":
          return t("preflight.noTrigger");
        case "multiple-triggers":
          return t("preflight.multipleTriggers", { node: nodeLabel });
        case "trigger-no-event":
          return t("preflight.triggerNoEvent", { node: nodeLabel });
        case "missing-required":
          return t("preflight.missingRequired", { node: nodeLabel, field: fieldLabel });
        case "orphan-node":
          return t("preflight.orphan", { node: nodeLabel });
        case "cycle":
          return t("preflight.cycle");
        case "duplicate-slug":
          return t("preflight.duplicateSlug", { node: nodeLabel, slug: node?.data.slug ?? "" });
        case "unknown-node":
          return t("preflight.unknownNode", { node: nodeLabel });
        default:
          return nodeLabel;
      }
    },
    [nodes, descriptorByType, t],
  );

  const loading = automationQuery.isLoading || nodeTypesQuery.isLoading;

  if (automationQuery.isError) {
    return <div className="p-6 text-sm text-muted-foreground">{t("loadError")}</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar. Actions collapse to icon-only below `md` so the whole row
          (crucially the add-node + save buttons) fits a phone ; labels return
          at `md+`. Every button keeps an `aria-label` for the icon-only state. */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-2 sm:gap-2 sm:px-3">
        {/* Icon-only : the label ("Back to automations") stays as the aria-label
            so the toolbar reads as a compact back affordance, not a wide button. */}
        <Button variant="ghost" size="sm" onClick={handleBack} aria-label={t("back")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {automationQuery.data?.name ?? ""}
        </span>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {canManage && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch
                checked={enabled}
                aria-label={t("enabledLabel")}
                onCheckedChange={(v) => {
                  setEnabled(v);
                  setEnabledMutation.mutate({ id: automationId, enabled: v });
                }}
              />
              <span className="hidden md:inline">{t("enabledLabel")}</span>
            </label>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            aria-label={t("runHistory")}
          >
            <History className="h-4 w-4 md:mr-1" aria-hidden />
            <span className="hidden md:inline">{t("runHistory")}</span>
          </Button>
          {/* Pre-flight : a click-through list of validation issues. Errors
              (missing required inputs, no trigger, cycle) block Run ; warnings
              (orphan nodes) just inform. Each row jumps to its node. */}
          {issues.length > 0 && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t("preflight.label", { count: issues.length })}
                  className={hasErrors ? "text-destructive" : "text-amber-600"}
                >
                  <AlertTriangle className="h-4 w-4 md:mr-1" aria-hidden />
                  <span>{issues.length}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>{t("preflight.heading")}</DropdownMenuLabel>
                {issues.map((issue, i) => (
                  <DropdownMenuItem
                    key={`${issue.code}-${issue.nodeId ?? "graph"}-${issue.fieldKey ?? ""}-${i}`}
                    disabled={!issue.nodeId}
                    onSelect={() => {
                      if (issue.nodeId) setSelectedId(issue.nodeId);
                    }}
                    className="items-start gap-2"
                  >
                    {issue.severity === "error" ? (
                      <AlertCircle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                        aria-hidden
                      />
                    ) : (
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
                        aria-hidden
                      />
                    )}
                    <span className="text-xs leading-snug">{issueText(issue)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canRun && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestRun}
              disabled={runNow.isPending || saveMutation.isPending || hasErrors}
              aria-label={t("runNow")}
              title={hasErrors ? t("preflight.runBlocked") : undefined}
            >
              <Play className="h-4 w-4 md:mr-1" aria-hidden />
              <span className="hidden md:inline">{t("runNow")}</span>
            </Button>
          )}
          {activeRunId && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearRun}
              disabled={runActive}
              aria-label={t("clearRun")}
              title={runActive ? t("clearRunBusy") : t("clearRun")}
            >
              <Eraser className="h-4 w-4 md:mr-1" aria-hidden />
              <span className="hidden md:inline">{t("clearRun")}</span>
            </Button>
          )}
          {canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddOpen(true)}
                aria-label={t("palette")}
                title={`${t("palette")} (N)`}
              >
                <Plus className="h-4 w-4 md:mr-1" aria-hidden />
                <span className="hidden md:inline">{t("palette")}</span>
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending || !dirty}
                aria-label={t("save")}
              >
                <Save className="h-4 w-4 md:mr-1" aria-hidden />
                <span className="hidden md:inline">{dirty ? t("saveChanges") : t("save")}</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Canvas + config panel */}
      <div className="flex min-h-0 flex-1">
        <div className="automation-canvas relative min-h-0 flex-1">
          {loading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-24 w-48" />
              <Skeleton className="h-24 w-48" />
            </div>
          ) : (
            <EdgeActionsContext.Provider value={edgeActions}>
              <RunVizContext.Provider value={runViz}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  isValidConnection={isValidConnection}
                  onNodeClick={(_, node) => {
                    setSelectedId(node.id);
                    setNodeMenu(null);
                  }}
                  onNodeContextMenu={(e, node) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    setSelectedId(node.id);
                    setNodeMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
                  }}
                  onPaneClick={() => {
                    setSelectedId(null);
                    setNodeMenu(null);
                  }}
                  nodesDraggable={canEdit}
                  nodesConnectable={canEdit}
                  edgesFocusable={canEdit}
                  elementsSelectable={canEdit}
                  deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="var(--border)" gap={18} />
                  <Controls showInteractive={false} />
                  <MiniMap pannable zoomable />
                  {/* Legend : edges are the run-order spine (data flows via
                      `{{ }}` references, not wires). */}
                  <Panel
                    position="top-right"
                    className="pointer-events-none rounded-md border border-border bg-background/90 px-2 py-1 shadow-sm backdrop-blur"
                  >
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground" aria-hidden />
                        {t("legendFlow")}
                      </span>
                    </div>
                  </Panel>
                </ReactFlow>
              </RunVizContext.Provider>
            </EdgeActionsContext.Provider>
          )}
          {!loading && nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t("emptyCanvas")}</p>
            </div>
          )}
          {activeRunId && (
            <RunLogPanel
              steps={revealedSteps}
              status={runStatus}
              waiting={
                runStatus === "PENDING" &&
                revealed >= runSteps.length &&
                activeRunQuery.data?.nextAttemptAt != null &&
                new Date(activeRunQuery.data.nextAttemptAt as unknown as string).getTime() >
                  Date.now()
              }
              nodeLabel={(nodeId) => {
                const n = nodes.find((x) => x.id === nodeId);
                return (n?.data.name?.trim() || n?.data.label) ?? nodeId;
              }}
              onClose={clearRun}
            />
          )}
        </div>

        {/* Config panel : a side rail on desktop. On mobile a `w-80` column
            would bury the canvas, so it's hidden here and shown as a bottom
            sheet (below) opened by the current node selection. */}
        {selectedNode && (
          <aside
            className="relative hidden shrink-0 border-l border-border md:flex"
            style={{ width: panelWidth }}
          >
            {/* Left-edge resize grip — the shared chip used on the detail-panel
                and table-column resize edges (reveals on hover, stays while
                dragging). */}
            <DragHandle
              orientation="vertical"
              active={resizing}
              highlight
              onPointerDown={startPanelResize}
              className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2"
            />
            <div className="@container flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t("inspector")}</h2>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label={t("closeInspector")}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <ConfigPanel
                selectedNode={selectedNode}
                selectedDescriptor={selectedDescriptor}
                canEdit={canEdit}
                errorKeys={selectedErrorKeys}
                runStep={selectedStep}
                onDelete={deleteSelected}
                onToggleErrorOutput={toggleSelectedErrorOutput}
                automationId={automationId}
                onGenerateHttpSecret={generateHttpSecret}
                generatingSecret={newHttpSecret.isPending}
                eventTypeOptions={eventTypeOptions}
                eventFields={eventFieldsByType}
                variables={variableGroups}
                resolveToken={resolveToken}
                modelOptions={modelOptions}
                memberOptions={memberOptions}
                secretOptions={secretOptions}
                onConfigChange={updateSelectedConfig}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Mobile config : a bottom sheet driven by the current selection, so the
          canvas keeps the full width. */}
      {isMobile && (
        <Sheet
          open={selectedId != null}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        >
          {/* Full-screen on mobile (no top gap) : the config panel needs the
              whole height for its stacked sections. `side="full"` is 100dvh with
              the built-in top-right close X. */}
          <SheetContent side="full" className="overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{t("inspector")}</SheetTitle>
            </SheetHeader>
            <div className="@container mt-4">
              <ConfigPanel
                selectedNode={selectedNode}
                selectedDescriptor={selectedDescriptor}
                canEdit={canEdit}
                errorKeys={selectedErrorKeys}
                runStep={selectedStep}
                onDelete={deleteSelected}
                onToggleErrorOutput={toggleSelectedErrorOutput}
                automationId={automationId}
                onGenerateHttpSecret={generateHttpSecret}
                generatingSecret={newHttpSecret.isPending}
                eventTypeOptions={eventTypeOptions}
                eventFields={eventFieldsByType}
                variables={variableGroups}
                resolveToken={resolveToken}
                modelOptions={modelOptions}
                memberOptions={memberOptions}
                secretOptions={secretOptions}
                onConfigChange={updateSelectedConfig}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("runHistory")}</SheetTitle>
          </SheetHeader>
          <RunHistory
            automationId={automationId}
            open={historyOpen}
            nodeLabelOf={(type) => descriptorByType.get(type)?.label ?? type}
          />
        </SheetContent>
      </Sheet>

      <AddNodeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        descriptors={descriptors}
        onAdd={addNode}
      />

      {/* Right-click node menu + its dialogs. */}
      {nodeMenu && (
        <NodeContextMenu
          x={nodeMenu.x}
          y={nodeMenu.y}
          onRename={() => {
            setRenameTarget(nodeMenu.nodeId);
            setNodeMenu(null);
          }}
          onReplace={() => {
            setReplaceTarget(nodeMenu.nodeId);
            setNodeMenu(null);
          }}
          onDelete={() => {
            deleteNode(nodeMenu.nodeId);
            setNodeMenu(null);
          }}
          onClose={() => setNodeMenu(null)}
        />
      )}

      <RenameNodeDialog
        open={renameTarget != null}
        initialName={renameNodeInst?.data.name ?? ""}
        initialSlug={renameNodeInst?.data.slug ?? ""}
        takenSlugs={new Set(nodes.filter((n) => n.id !== renameTarget).map((n) => n.data.slug))}
        placeholder={
          (renameNodeInst && descriptorByType.get(renameNodeInst.data.descriptorType)?.label) ?? ""
        }
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
        onSave={(name, slug) => {
          if (renameTarget) renameNode(renameTarget, name, slug);
          setRenameTarget(null);
        }}
      />

      {/* Replace : pick a same-kind node type, then confirm before swapping. */}
      <AddNodeDialog
        open={replaceTarget != null}
        onOpenChange={(o) => {
          if (!o) setReplaceTarget(null);
        }}
        descriptors={replaceCandidates}
        title={t("replacePickTitle")}
        onAdd={(desc) => {
          if (replaceTarget) setReplacePending({ nodeId: replaceTarget, desc });
          setReplaceTarget(null);
        }}
      />

      <ConfirmDialog
        open={replacePending != null}
        onOpenChange={(o) => {
          if (!o) setReplacePending(null);
        }}
        title={t("replaceConfirmTitle")}
        description={t("replaceConfirmBody")}
        cancelLabel={t("cancel")}
        confirmLabel={t("replaceConfirmAction")}
        onConfirm={() => {
          if (replacePending) replaceNode(replacePending.nodeId, replacePending.desc);
          setReplacePending(null);
        }}
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t("leaveTitle")}
        description={t("leaveBody")}
        cancelLabel={t("leaveCancel")}
        confirmLabel={t("leaveConfirm")}
        onConfirm={() => {
          setLeaveOpen(false);
          router.push("/automation");
        }}
      />
    </div>
  );
}

// Resolve a node's / category's icon. Node descriptors carry a Lucide icon
// name ; names we don't import 1:1 alias onto a close stand-in, and anything
// unknown falls back to the category icon, then a generic box.
const NODE_ICON_BY_NAME: Record<string, LucideIcon> = {
  Zap,
  GitBranch,
  Braces,
  Clock,
  Sigma,
  Variable,
  Bell,
  Mail,
  Webhook,
  Database,
  Shield,
  User,
  FunctionSquare: Sigma,
  DatabasePlus: Database,
  DatabasePen: Database,
  DatabaseX: Database,
  DatabaseSearch: Database,
  ShieldPlus: Shield,
  ShieldMinus: Shield,
  UserSearch: User,
  UserCog: User,
  UserPen: User,
  UserX: User,
};
const CATEGORY_ICON: Record<string, LucideIcon> = {
  trigger: Zap,
  control: GitBranch,
  communication: Send,
  data: Database,
  rbac: Shield,
  user: User,
  test: FlaskConical,
};
function categoryIcon(category: string): LucideIcon {
  return CATEGORY_ICON[category] ?? Box;
}
function nodeIcon(d: { icon?: string; category: string }): LucideIcon {
  return (d.icon ? NODE_ICON_BY_NAME[d.icon] : undefined) ?? categoryIcon(d.category);
}

/**
 * The right-click node menu : a small popover pinned at the cursor with Rename /
 * Replace / Delete. A fixed backdrop closes it on any outside click (Escape is
 * handled by the editor). Positions are clamped so it stays on-screen near a
 * right / bottom edge.
 */
function NodeContextMenu({
  x,
  y,
  onRename,
  onReplace,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  onRename: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("automation.editor");
  const left = typeof window !== "undefined" ? Math.min(x, window.innerWidth - 184) : x;
  const top = typeof window !== "undefined" ? Math.min(y, window.innerHeight - 160) : y;
  const itemClass = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm";
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        role="menu"
        className="fixed z-50 min-w-[168px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        style={{ left, top }}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onRename}
          className={cn(itemClass, "hover:bg-accent")}
        >
          <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t("menuRename")}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={onReplace}
          className={cn(itemClass, "hover:bg-accent")}
        >
          <Replace className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t("menuReplace")}
        </button>
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          role="menuitem"
          onClick={onDelete}
          className={cn(itemClass, "text-destructive hover:bg-destructive/10")}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t("menuDelete")}
        </button>
      </div>
    </>
  );
}

/**
 * Rename-node dialog (opened from the right-click menu). Edits two things: the
 * display **name** (empty clears the custom label so the face falls back to the
 * type label) and the **reference slug** — the `{{ steps.<slug> }}` handle other
 * nodes address this node by. The slug must be a valid identifier and unique in
 * the graph ; changing it rewrites references to it (handled by the caller).
 */
function RenameNodeDialog({
  open,
  initialName,
  initialSlug,
  takenSlugs,
  placeholder,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initialName: string;
  initialSlug: string;
  /** Slugs of every OTHER node, so the edited slug can be checked for collisions. */
  takenSlugs: Set<string>;
  placeholder: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, slug: string) => void;
}) {
  const t = useTranslations("automation.editor");
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  useEffect(() => {
    if (open) {
      setName(initialName);
      setSlug(initialSlug);
    }
  }, [open, initialName, initialSlug]);
  const trimmedSlug = slug.trim();
  const slugError =
    trimmedSlug === "" || !NODE_SLUG_RE.test(trimmedSlug)
      ? t("slugInvalid")
      : takenSlugs.has(trimmedSlug)
        ? t("slugTaken")
        : null;
  const save = () => {
    if (slugError) return;
    onSave(name.trim(), trimmedSlug);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{t("renameTitle")}</DialogTitle>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("nodeDisplayName")}</Label>
            <Input
              autoFocus
              value={name}
              placeholder={placeholder}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("nodeSlug")}</Label>
            <Input
              value={slug}
              spellCheck={false}
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
            />
            <p
              className={cn(
                "text-[11px]",
                slugError ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {slugError ?? t("slugHint", { token: `{{ steps.${trimmedSlug || "name"} }}` })}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={save} disabled={slugError != null}>
              {t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Two-pane add-node picker : a category sidebar (icon + count) on the left, the
 * category's nodes (icon + label + description) on the right, and a search on
 * top that filters across all categories. Opened from the toolbar button or the
 * "N" shortcut ; scales as the node set grows.
 */
function AddNodeDialog({
  open,
  onOpenChange,
  descriptors,
  onAdd,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  descriptors: NodeDescriptor[];
  onAdd: (d: NodeDescriptor) => void;
  /** Accessible dialog title ; defaults to the "Add node" palette label. */
  title?: string;
}) {
  const t = useTranslations("automation.editor");
  const categories = useMemo(
    () => [...new Set(descriptors.map((d) => d.category))].sort(),
    [descriptors],
  );
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveCategory(categories[0] ?? "");
    }
  }, [open, categories]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (q) {
      return descriptors.filter(
        (d) =>
          d.label.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          (d.description ?? "").toLowerCase().includes(q),
      );
    }
    return descriptors.filter((d) => d.category === activeCategory);
  }, [descriptors, q, activeCategory]);

  const add = (d: NodeDescriptor) => {
    onAdd(d);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* hideClose : the default top-right X lands on top of the search row and
          reads as off-centre inside it ; Escape / click-outside still dismiss. */}
      <DialogContent hideClose className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{title ?? t("palette")}</DialogTitle>
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) add(results[0]);
              }}
              placeholder={t("addNodeSearch")}
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex h-[60vh] max-h-[440px]">
          <div className="w-40 shrink-0 space-y-0.5 overflow-y-auto border-r border-border p-2 sm:w-48">
            {categories.map((cat) => {
              const CatIcon = categoryIcon(cat);
              const count = descriptors.filter((d) => d.category === cat).length;
              const active = !q && cat === activeCategory;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setActiveCategory(cat);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm capitalize",
                    active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                >
                  <CatIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{cat}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("addNodeEmpty")}</p>
            ) : (
              <div className="space-y-1">
                {results.map((d) => {
                  const Icon = nodeIcon(d);
                  return (
                    <button
                      key={d.type}
                      type="button"
                      onClick={() => add(d)}
                      className="flex w-full items-start gap-3 rounded-md p-2 text-left hover:bg-accent"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{d.label}</span>
                        {d.description && (
                          <span className="block text-xs text-muted-foreground">
                            {d.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The selected node's config editor — the badge + delete + per-field inputs.
 * Rendered in the desktop side rail and the mobile bottom sheet, so it stays
 * data-only and reads its selection through props.
 */
function ConfigPanel({
  selectedNode,
  selectedDescriptor,
  canEdit,
  errorKeys,
  runStep,
  onDelete,
  onToggleErrorOutput,
  automationId,
  onGenerateHttpSecret,
  generatingSecret,
  eventTypeOptions,
  eventFields,
  variables,
  resolveToken,
  modelOptions,
  memberOptions,
  secretOptions,
  onConfigChange,
}: {
  selectedNode: AppNode | null;
  selectedDescriptor: NodeDescriptor | undefined;
  canEdit: boolean;
  errorKeys: Set<string>;
  runStep: RunStepView | null;
  onDelete: () => void;
  onToggleErrorOutput: (on: boolean) => void;
  automationId: string;
  onGenerateHttpSecret: () => void;
  generatingSecret: boolean;
  eventTypeOptions: { value: string; label: string }[];
  eventFields: Map<string, EventField[]>;
  /** `{{ ... }}` references available to this node, grouped by source. */
  variables: VarGroup[];
  /** Label a `{{ }}` token for its chip in a config field. */
  resolveToken: (raw: string) => ResolvedVariableToken;
  modelOptions: Array<{ value: string; label: string }>;
  memberOptions: Array<{ value: string; label: string }>;
  /** Names of the org's secrets for a `secret` config field (never values). */
  secretOptions: string[];
  onConfigChange: (key: string, value: unknown) => void;
}) {
  const t = useTranslations("automation.editor");

  // Click-to-insert: the focused VariableInput registers its imperative handle
  // here (and clears it on blur). The variable picker calls `insertToken` to drop
  // a `{{ ... }}` chip at the caret ; it falls back to clipboard copy when no
  // field is focused. Also cleared when the selection changes, so a stale,
  // detached field is never written to.
  const activeInputRef = useRef<VariableInputHandle | null>(null);
  useEffect(() => {
    activeInputRef.current = null;
  }, [selectedNode?.id]);
  const registerActiveInput = useCallback((handle: VariableInputHandle | null) => {
    activeInputRef.current = handle;
  }, []);
  const insertVariable = useCallback(
    (token: string) => {
      const active = activeInputRef.current;
      if (!active) {
        void navigator.clipboard?.writeText(token);
        toast.success(t("outputCopied", { ref: token }));
        return;
      }
      active.insertToken(token);
    },
    [t],
  );
  // The same available variables, flattened for the fields' inline autocomplete
  // (typing `{{` in a field opens a menu grouped by source node).
  const suggestions = useMemo<VariableSuggestion[]>(
    () =>
      variables.flatMap((g) =>
        g.items.map((it) => ({ token: it.token, label: it.label, group: g.title, hint: it.hint })),
      ),
    [variables],
  );

  if (!selectedNode || !selectedDescriptor) {
    return <p className="text-sm text-muted-foreground">{t("noSelection")}</p>;
  }

  const NodeTypeIcon = nodeIcon(selectedDescriptor);
  // Advanced disclosure (currently just the error-output toggle) applies to
  // editable, non-trigger nodes ; triggers are the flow entry with no error out.
  const showAdvanced = canEdit && selectedNode.data.kind !== "trigger";
  // A trigger's outputs: the fields the chosen event exposes, so the author can
  // see (and copy) what `{{ trigger.* }}` values the rest of the flow can read.
  const isTrigger = selectedNode.data.kind === "trigger";
  const triggerEventType = isTrigger ? (triggerEventTypeForNode(selectedNode.data) ?? null) : null;
  const triggerOutputs = triggerEventType ? (eventFields.get(triggerEventType) ?? []) : [];
  // HTTP trigger: its inbound URL + per-automation secret (generated server-side).
  const isHttpTrigger = selectedNode.data.descriptorType === HTTP_TRIGGER_TYPE;
  const httpSecret =
    typeof selectedNode.data.config.secret === "string" ? selectedNode.data.config.secret : "";
  const httpUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/hooks/automation/${automationId}`;

  return (
    <div>
      {/* Section 1 — node identity: type + custom name (read-only ; rename via
          the right-click menu) and delete. The bordered sections below stack
          flush (each carries its own top border as the divider), so this block
          keeps a little bottom padding of its own. */}
      <section className="space-y-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
              <NodeTypeIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {selectedNode.data.name?.trim() || selectedDescriptor.label}
              </span>
              {selectedNode.data.name?.trim() && (
                <span className="truncate text-[11px] text-muted-foreground">
                  {selectedDescriptor.label}
                </span>
              )}
            </div>
          </div>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
              <span className="sr-only">{t("deleteNode")}</span>
            </Button>
          )}
        </div>
      </section>

      {/* HTTP trigger — inbound URL + secret. Read-only fields (click to select
          and copy) plus a server-side secret generator. */}
      {isHttpTrigger && (
        <section className="space-y-3 border-t border-border pt-3 pb-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("httpEndpoint")}
          </h3>
          <p className="text-[11px] text-muted-foreground">{t("httpEndpointHint")}</p>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("httpUrl")}</Label>
            <Input
              readOnly
              value={httpUrl}
              className="font-mono text-[11px]"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("httpSecret")}</Label>
            {httpSecret ? (
              <Input
                readOnly
                value={httpSecret}
                className="font-mono text-[11px]"
                onFocus={(e) => e.currentTarget.select()}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">{t("httpNoSecret")}</p>
            )}
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={generatingSecret}
                onClick={onGenerateHttpSecret}
              >
                {httpSecret ? t("httpRegenerate") : t("httpGenerate")}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{t("httpAuthHint")}</p>
        </section>
      )}

      {/* Section 2 — configuration : a primary expandable (full-width bar),
          open by default since it's the node's main content. Holds the config
          fields plus a nested "Advanced" disclosure. Rendered whenever there's
          something to show — config fields, or the advanced error-output toggle
          (non-trigger + editable). */}
      {(selectedDescriptor.configFields.length > 0 || showAdvanced) && (
        <PanelSection
          title={t("configuration")}
          defaultOpen
          contentClassName="space-y-3 px-4 pb-3 pt-1"
        >
          {selectedDescriptor.configFields.map((field) => (
            <ConfigField
              // Key by node too, so the per-field value/variable mode resets when
              // the selection changes (it's local state, not persisted).
              key={`${selectedNode.id}:${field.key}`}
              field={field}
              value={selectedNode.data.config[field.key]}
              disabled={!canEdit}
              error={errorKeys.has(field.key)}
              eventTypeOptions={eventTypeOptions}
              modelOptions={modelOptions}
              memberOptions={memberOptions}
              secretOptions={secretOptions}
              resolveToken={resolveToken}
              suggestions={suggestions}
              onFocusRegister={registerActiveInput}
              onChange={(v) => onConfigChange(field.key, v)}
            />
          ))}

          {/* Advanced : a *secondary* disclosure nested inside Configuration
              (no full-width bar, just underline-on-hover text + a small caret),
              collapsed by default. Triggers are the flow entry, so they don't
              get an error output. */}
          {showAdvanced && (
            <Collapsible className={selectedDescriptor.configFields.length > 0 ? "pt-1" : ""}>
              <CollapsibleTrigger className="group flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                <span className="underline-offset-2 group-hover:underline">{t("advanced")}</span>
                <ChevronDown
                  className="h-3 w-3 transition group-data-[state=open]:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <Label className="text-xs">{t("errorOutputLabel")}</Label>
                    <p className="text-[11px] text-muted-foreground">{t("errorOutputHint")}</p>
                  </div>
                  <Switch
                    checked={selectedNode.data.errorOutput}
                    onCheckedChange={(v) => onToggleErrorOutput(v)}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </PanelSection>
      )}

      {/* Section 3 — trigger outputs : the fields the chosen event exposes for
          `{{ trigger.* }}`. Only triggers ; inert until an event is chosen. */}
      {isTrigger && <TriggerOutputs fields={triggerOutputs} hasEvent={triggerEventType != null} />}

      {/* Section 3b — variables : for a non-trigger node, every `{{ ... }}` it can
          reference (trigger fields + upstream node outputs), so the author never
          has to reopen the trigger / earlier nodes to recall what's available. */}
      {!isTrigger && <NodeVariables groups={variables} onInsert={insertVariable} />}

      {/* Section 4 — last run : always shown, inert until a run produces a step. */}
      <RunResult key={`run-${runStep?.id ?? "none"}`} step={runStep} />

      {/* Section 4 — this node's own log lines from the last run. */}
      <RunLogs key={`logs-${runStep?.id ?? "none"}`} step={runStep} />
    </div>
  );
}

/** A config value currently holding a `{{ }}` reference rather than a fixed value. */
function valueIsExpression(value: unknown): boolean {
  return typeof value === "string" && value.includes("{{");
}

// Field types whose native editor (dropdown / switch / number spinner) can't
// hold a `{{ }}` token, so they get a "value / variable" toggle that swaps in a
// plain text box. `text` / `textarea` / `json` already accept references ;
// `event-type` is trigger-only (no upstream variables) and drives the event-
// fields UI ; `schedule` is a structured builder — none of those get the toggle.
const VARIABLE_TOGGLE_TYPES = new Set([
  "boolean",
  "number",
  "select",
  "data-model",
  "user",
  "secret",
]);

function ConfigField({
  field,
  value,
  disabled,
  error,
  eventTypeOptions,
  modelOptions,
  memberOptions,
  secretOptions,
  resolveToken,
  suggestions,
  onChange,
  onFocusRegister,
}: {
  field: NodeDescriptor["configFields"][number];
  value: unknown;
  disabled: boolean;
  error: boolean;
  eventTypeOptions: { value: string; label: string }[];
  modelOptions: Array<{ value: string; label: string }>;
  memberOptions: Array<{ value: string; label: string }>;
  /** Names of the org's secrets for a `secret` config field (never values). */
  secretOptions: string[];
  /** Label a `{{ }}` token for its chip in this field's variable input. */
  resolveToken: (raw: string) => ResolvedVariableToken;
  /** Variables offered by the field's inline autocomplete (typing `{{`). */
  suggestions: VariableSuggestion[];
  onChange: (value: unknown) => void;
  /** Register the focused variable input so the picker can insert at its caret. */
  onFocusRegister?: (handle: VariableInputHandle | null) => void;
}) {
  const t = useTranslations("automation.editor");
  const inputDisabled = disabled;
  const strValue = typeof value === "string" ? value : value == null ? "" : String(value);
  // A field whose native control can't hold a `{{ }}` token offers a toggle to a
  // plain text box. It's forced on whenever the stored value is already an
  // expression (e.g. a saved graph), so such a value always shows as editable
  // text rather than silently vanishing from a dropdown that has no such option.
  const [varMode, setVarMode] = useState(false);
  const canToggleVariable = VARIABLE_TOGGLE_TYPES.has(field.type);
  const useVariable = canToggleVariable && (varMode || valueIsExpression(value));
  const toggleVariable = () => {
    if (useVariable) {
      // Leaving variable mode : clear an expression so the native control is usable.
      if (valueIsExpression(value)) onChange(undefined);
      setVarMode(false);
    } else {
      setVarMode(true);
    }
  };
  // Free-text fields (message body, subject) always take references, so they get
  // a `{ }` picker button that inserts a chip at the caret (via the field's
  // handle, captured on focus ; append as a fallback if never focused).
  const isTextField = field.type === "text" || field.type === "textarea" || field.type === "json";
  const fieldHandleRef = useRef<VariableInputHandle | null>(null);
  const registerFieldHandle = (h: VariableInputHandle | null) => {
    onFocusRegister?.(h);
    if (h) fieldHandleRef.current = h;
  };
  const insertIntoField = (token: string) => {
    if (fieldHandleRef.current) fieldHandleRef.current.insertToken(token);
    else onChange(strValue ? `${strValue} ${token}` : token);
  };
  const selectOptions =
    field.type === "event-type"
      ? eventTypeOptions
      : field.type === "data-model"
        ? modelOptions
        : field.type === "user"
          ? memberOptions
          : field.type === "secret"
            ? secretOptions.map((o) => ({ value: o, label: o }))
            : (field.options ?? []);
  // A `secret` field with no secrets defined can't be filled from the picker ;
  // point the author at the admin surface instead of showing an empty dropdown.
  const secretsEmpty = field.type === "secret" && secretOptions.length === 0;

  return (
    <div className="flex flex-col gap-1.5 @md:grid @md:grid-cols-[8.5rem_minmax(0,1fr)] @md:items-start @md:gap-x-3">
      <div className="flex items-center justify-between gap-2 @md:pt-1.5">
        <Label className={cn("text-xs", error && "text-destructive")}>
          {field.label}
          {error && <span aria-hidden> *</span>}
        </Label>
        {canToggleVariable && !disabled ? (
          <button
            type="button"
            onClick={toggleVariable}
            aria-pressed={useVariable}
            title={useVariable ? t("useFixedValue") : t("useVariable")}
            aria-label={useVariable ? t("useFixedValue") : t("useVariable")}
            className={cn(
              "rounded p-0.5 transition hover:text-primary",
              useVariable ? "text-primary" : "text-muted-foreground/60",
            )}
          >
            <Braces className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : isTextField && !disabled ? (
          <VariablePicker
            suggestions={suggestions}
            onPick={insertIntoField}
            ariaLabel={t("variablePickerTitle")}
            triggerClassName="rounded p-0.5 text-muted-foreground/60 transition hover:text-primary"
          >
            <Braces className="h-3.5 w-3.5" aria-hidden />
          </VariablePicker>
        ) : null}
      </div>
      <div className="min-w-0 space-y-1.5">
        {useVariable ? (
          <VariablePicker
            suggestions={suggestions}
            onPick={(token) => onChange(token)}
            disabled={inputDisabled}
            ariaLabel={field.label}
            triggerClassName={cn(
              "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {valueIsExpression(value) ? (
              (() => {
                const r = resolveToken(strValue);
                return (
                  <span
                    className={cn(
                      "truncate rounded px-1 text-[0.85em] font-medium",
                      r.invalid
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {r.label}
                  </span>
                );
              })()
            ) : (
              <span className="truncate text-muted-foreground">{t("chooseVariable")}</span>
            )}
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </VariablePicker>
        ) : field.type === "schedule" ? (
          <ScheduleBuilder
            value={value as AutomationSchedule | undefined}
            disabled={inputDisabled}
            onChange={onChange}
          />
        ) : field.type === "textarea" || field.type === "json" ? (
          <VariableInput
            multiline
            value={strValue}
            onChange={(v) => onChange(v)}
            resolveToken={resolveToken}
            suggestions={suggestions}
            placeholder={field.placeholder}
            disabled={inputDisabled}
            aria-label={field.label}
            onFocusRegister={registerFieldHandle}
          />
        ) : field.type === "boolean" ? (
          <div>
            <Switch
              checked={value === true}
              disabled={inputDisabled}
              onCheckedChange={(v) => onChange(v)}
            />
          </div>
        ) : field.type === "number" ? (
          <Input
            type="number"
            value={strValue}
            disabled={inputDisabled}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        ) : secretsEmpty ? (
          <p className="text-[11px] text-muted-foreground">
            {t.rich("secretsEmpty", {
              link: (chunks) => (
                <Link href="/admin/secrets" className="text-primary underline underline-offset-2">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        ) : field.type === "select" ||
          field.type === "event-type" ||
          field.type === "data-model" ||
          field.type === "user" ||
          field.type === "secret" ? (
          <Select value={strValue} disabled={inputDisabled} onValueChange={(v) => onChange(v)}>
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <VariableInput
            value={strValue}
            onChange={(v) => onChange(v)}
            resolveToken={resolveToken}
            suggestions={suggestions}
            placeholder={field.placeholder}
            disabled={inputDisabled}
            aria-label={field.label}
            onFocusRegister={registerFieldHandle}
          />
        )}
        {field.help && <p className="text-[11px] text-muted-foreground">{field.help}</p>}
      </div>
    </div>
  );
}

function stepDurationMs(start?: unknown, end?: unknown): number | null {
  if (!start || !end) return null;
  const s = new Date(start as string).getTime();
  const e = new Date(end as string).getTime();
  return Number.isFinite(s) && Number.isFinite(e) ? Math.max(0, e - s) : null;
}
function formatStepOutput(output: unknown): string {
  if (output == null) return "";
  try {
    const str = typeof output === "string" ? output : JSON.stringify(output);
    return str.length > 140 ? `${str.slice(0, 140)}…` : str;
  } catch {
    return "";
  }
}

type RunStepView = {
  id: string;
  nodeId: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  /** Opaque JSON from tRPC ; narrowed with {@link asLogLines} before rendering. */
  logs?: unknown;
  startedAt?: unknown;
  finishedAt?: unknown;
};

/** Narrow a step's opaque `logs` JSON to the log-line array (defensive against
 *  a malformed / legacy blob). */
function asLogLines(value: unknown): AutomationRunStepLog[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (l): l is AutomationRunStepLog =>
      l != null &&
      typeof l === "object" &&
      typeof (l as { message?: unknown }).message === "string",
  );
}

/** HH:MM:SS for a log line's ISO timestamp (drops the date — a run is one moment). */
function formatLogTime(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour12: false });
}

const LOG_LEVEL_CLASS: Record<AutomationRunStepLogLevel, string> = {
  info: "text-foreground",
  warn: "text-amber-600",
  error: "text-destructive",
};

/**
 * The selected node's own log lines from the last test run — a collapsible
 * section listing each `ctx.log(...)` line (timestamp + level color). Rendered
 * only when the step actually emitted lines, so quiet nodes don't show it.
 */
function RunLogs({ step }: { step: RunStepView | null }) {
  const t = useTranslations("automation.editor");
  const lines = step ? asLogLines(step.logs) : [];
  if (lines.length === 0) return <PanelSection title={t("logs")} disabled />;
  return (
    <PanelSection
      title={t("logs")}
      trailing={
        <Badge variant="outline" size="sm">
          {lines.length}
        </Badge>
      }
      contentClassName="border-t border-border bg-muted/20 px-4 py-3"
    >
      <ol className="space-y-1 font-mono text-[11px] leading-relaxed">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 tabular-nums text-muted-foreground/70">
              {formatLogTime(l.ts)}
            </span>
            <span
              className={cn("min-w-0 break-words", LOG_LEVEL_CLASS[l.level] ?? "text-foreground")}
            >
              {l.message}
            </span>
          </li>
        ))}
      </ol>
    </PanelSection>
  );
}

function stepStatusLabel(t: (k: string) => string, status: string): string {
  switch (status) {
    case "SUCCEEDED":
      return t("statusSucceeded");
    case "FAILED":
      return t("statusFailed");
    case "SKIPPED":
      return t("statusSkipped");
    default:
      return t("statusRunning");
  }
}

/** A labelled, scrollable JSON (or text) block for a step's input / output. */
function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const text =
    typeof value === "string"
      ? value
      : (() => {
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        })();
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-1.5 text-[11px] leading-tight">
        {text}
      </pre>
    </div>
  );
}

/**
 * A uniform inspector section : a full-width collapsible with a plain title
 * (not greyed, not uppercased, no leading icon), an optional trailing slot, and
 * the disclosure caret. Always rendered ; pass `disabled` to show the header but
 * keep it inert (dimmed, non-expandable) when the section has no content yet.
 */
function PanelSection({
  title,
  defaultOpen = false,
  disabled = false,
  trailing,
  contentClassName,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  contentClassName?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={!disabled && open}
      onOpenChange={setOpen}
      disabled={disabled}
      className="-mx-4 border-t border-border"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-40">
        <span className="text-xs font-semibold">{title}</span>
        <span className="flex items-center gap-2">
          {!disabled && trailing}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition",
              !disabled && open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={contentClassName}>{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A trigger's outputs: the fields the chosen event exposes, each shown with its
 * `{{ trigger.<key> }}` reference (click to copy), a type hint, and a
 * description — so the author sees exactly what information (who, when, …) the
 * rest of the flow can read. Always rendered for a trigger ; inert until an
 * event type is chosen.
 */
/**
 * Available `{{ ... }}` variables for the selected (non-trigger) node, grouped
 * by source — the trigger's event fields and each upstream node's output (whole
 * output always ; concrete keys appear once a test run has produced them). Each
 * reference is click-to-copy, so the author can pull values from earlier in the
 * flow without navigating back to those nodes. Inert until a variable exists.
 */
function NodeVariables({
  groups,
  onInsert,
}: {
  groups: VarGroup[];
  onInsert: (token: string) => void;
}) {
  const t = useTranslations("automation.editor");
  if (groups.length === 0) return <PanelSection title={t("variables")} disabled />;
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <PanelSection
      title={t("variables")}
      defaultOpen
      trailing={
        <Badge variant="outline" size="sm">
          {total}
        </Badge>
      }
      contentClassName="space-y-3 border-t border-border bg-muted/20 px-4 py-3"
    >
      <p className="text-[11px] text-muted-foreground">{t("variablesHint")}</p>
      {groups.map((g) => (
        <div key={g.id} className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {g.title}
          </p>
          <ul className="space-y-1">
            {g.items.map((it) => (
              <li key={it.token} className="flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onInsert(it.token)}
                  title={t("insertVariable")}
                  className="group flex min-w-0 items-center gap-1 rounded bg-background px-1.5 py-0.5 font-mono text-[11px] hover:text-primary"
                >
                  <span className="truncate">{it.label}</span>
                  <Plus
                    className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-100"
                    aria-hidden
                  />
                </button>
                {it.hint && (
                  <span className="truncate text-[10px] text-muted-foreground">{it.hint}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </PanelSection>
  );
}

function TriggerOutputs({ fields, hasEvent }: { fields: EventField[]; hasEvent: boolean }) {
  const t = useTranslations("automation.editor");
  if (!hasEvent || fields.length === 0) {
    return <PanelSection title={t("outputs")} disabled />;
  }
  const copy = (key: string) => {
    const ref = `{{ trigger.${key} }}`;
    void navigator.clipboard?.writeText(ref);
    toast.success(t("outputCopied", { ref }));
  };
  return (
    <PanelSection
      title={t("outputs")}
      defaultOpen
      trailing={
        <Badge variant="outline" size="sm">
          {fields.length}
        </Badge>
      }
      contentClassName="space-y-2 border-t border-border bg-muted/20 px-4 py-3"
    >
      <p className="text-[11px] text-muted-foreground">{t("outputsHint")}</p>
      <ul className="space-y-2">
        {fields.map((f) => (
          <li key={f.key} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copy(f.key)}
                title={t("copyReference")}
                className="group flex min-w-0 items-center gap-1 rounded bg-background px-1.5 py-0.5 font-mono text-[11px] hover:text-primary"
              >
                <span className="truncate">trigger.{f.key}</span>
                <Copy
                  className="h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-100"
                  aria-hidden
                />
              </button>
              <Badge
                variant="outline"
                size="sm"
                className="shrink-0 text-[10px] text-muted-foreground"
              >
                {f.type}
              </Badge>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{f.description}</p>
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}

/**
 * The selected node's result from the last test run, shown in the inspector.
 * Always rendered as a section ; disabled (inert) until a run produces a step.
 */
function RunResult({ step }: { step: RunStepView | null }) {
  const t = useTranslations("automation.editor");
  if (!step) return <PanelSection title={t("runResult")} disabled />;
  const dur = stepDurationMs(step.startedAt, step.finishedAt);
  const badge =
    step.status === "SUCCEEDED"
      ? "border-emerald-500/40 text-emerald-600"
      : step.status === "FAILED"
        ? "border-destructive/40 text-destructive"
        : step.status === "SKIPPED"
          ? "text-muted-foreground"
          : "border-amber-400/50 text-amber-600";
  const hasInput = step.input != null;
  const hasOutput = step.output != null;
  return (
    <PanelSection
      title={t("runResult")}
      // Open by default when there's something to attend to (failed / skipped).
      defaultOpen={step.status === "FAILED" || step.status === "SKIPPED"}
      trailing={
        <>
          {dur != null && <span className="text-[10px] text-muted-foreground">{dur}ms</span>}
          <Badge variant="outline" size="sm" className={badge}>
            {stepStatusLabel(t, step.status)}
          </Badge>
        </>
      }
      contentClassName="space-y-2 border-t border-border bg-muted/20 px-4 py-3"
    >
      {step.error && (
        <p className="whitespace-pre-wrap break-all text-[11px] text-destructive">{step.error}</p>
      )}
      {hasInput && <JsonBlock label={t("runInput")} value={step.input} />}
      {hasOutput && <JsonBlock label={t("runOutput")} value={step.output} />}
      {!step.error && !hasInput && !hasOutput && (
        <p className="text-[11px] text-muted-foreground">{t("runNoDetail")}</p>
      )}
    </PanelSection>
  );
}

/**
 * Live execution log for a test run, docked at the bottom of the canvas. Lists
 * each step as it's revealed (status dot + node label + duration + output /
 * error), auto-scrolling to the newest. Sits above the graph so the node
 * animation stays visible.
 */
function RunLogPanel({
  steps,
  status,
  waiting,
  nodeLabel,
  onClose,
}: {
  steps: RunStepView[];
  status: string | undefined;
  waiting: boolean;
  nodeLabel: (id: string) => string;
  onClose: () => void;
}) {
  const t = useTranslations("automation.editor");
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [steps.length]);

  const dotClass = (s: string) =>
    s === "SUCCEEDED"
      ? "bg-emerald-500"
      : s === "FAILED"
        ? "bg-destructive"
        : s === "SKIPPED"
          ? "bg-muted-foreground/40"
          : "bg-amber-400 animate-pulse";
  const headerLabel =
    status === "SUCCEEDED"
      ? t("statusSucceeded")
      : status === "FAILED"
        ? t("statusFailed")
        : waiting
          ? t("runWaiting")
          : t("statusRunning");
  const headerDot =
    status === "SUCCEEDED"
      ? "bg-emerald-500"
      : status === "FAILED"
        ? "bg-destructive"
        : "bg-amber-400";

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className={cn("h-2 w-2 rounded-full", headerDot)} aria-hidden />
          {t("executionLog")} — {headerLabel}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label={t("closeLog")}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="max-h-44 overflow-y-auto px-3 py-2">
        {steps.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">{t("statusRunning")}…</p>
        ) : (
          <ol className="space-y-1">
            {steps.map((s) => {
              const dur = stepDurationMs(s.startedAt, s.finishedAt);
              const detail = s.error ?? formatStepOutput(s.output);
              return (
                <li key={s.id} className="flex items-start gap-2 text-[11px]">
                  <span
                    className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dotClass(s.status))}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{nodeLabel(s.nodeId)}</span>
                    {dur != null && <span className="ml-2 text-muted-foreground">{dur}ms</span>}
                    {detail && (
                      <span
                        className={cn(
                          "ml-2 break-all",
                          s.error ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {detail}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
            <div ref={bottomRef} />
          </ol>
        )}
      </div>
    </div>
  );
}

function RunHistory({
  automationId,
  open,
  nodeLabelOf,
}: {
  automationId: string;
  open: boolean;
  nodeLabelOf: (type: string) => string;
}) {
  const t = useTranslations("automation.editor");
  const tStatus = useTranslations("automation.runStatus");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const runsQuery = trpc.automation.runs.list.useQuery(
    { automationId, limit: 25 },
    { enabled: open, refetchOnWindowFocus: false },
  );
  const runDetail = trpc.automation.runs.getById.useQuery(
    { id: expandedId ?? "" },
    { enabled: open && expandedId != null, refetchOnWindowFocus: false },
  );

  const runs = runsQuery.data?.items ?? [];

  const statusTone: Record<string, string> = {
    SUCCEEDED: "border-emerald-500/40 text-emerald-600",
    FAILED: "border-destructive/40 text-destructive",
    RUNNING: "border-blue-500/40 text-blue-600",
    PENDING: "text-muted-foreground",
    CANCELED: "text-muted-foreground",
  };

  if (runsQuery.isLoading) {
    return (
      <div className="mt-4 space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (runs.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">{t("noRuns")}</p>;
  }

  return (
    <ul className="mt-4 space-y-2">
      {runs.map((run) => (
        <li key={run.id} className="rounded-md border border-border">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            onClick={() => setExpandedId((id) => (id === run.id ? null : run.id))}
          >
            <Badge variant="outline" size="sm" className={statusTone[run.status] ?? ""}>
              {tStatus(run.status)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(run.createdAt as unknown as string).toLocaleString()}
            </span>
          </button>
          {expandedId === run.id && (
            <div className="border-t border-border px-3 py-2">
              {runDetail.isLoading ? (
                <Skeleton className="h-6 w-full" />
              ) : (
                <ol className="space-y-1">
                  {(runDetail.data?.steps ?? []).map((step) => (
                    <li key={step.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{nodeLabelOf(step.nodeType)}</span>
                      <span className={statusTone[step.status] ?? ""}>
                        {stepStatusLabel(t, step.status)}
                      </span>
                    </li>
                  ))}
                  {runDetail.data?.error && (
                    <li className="text-xs text-destructive">{runDetail.data.error}</li>
                  )}
                </ol>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
