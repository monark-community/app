import type { FC, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ColorInput } from "@/components/ui/color-input";
import {
  AutoForm,
  dataFieldToFieldDef,
  FieldCell,
  fieldColumn,
  RichTextEditor,
  useFieldStrings,
  type DataFieldForAdapter,
  type FieldDef,
  type RelationOption,
} from "@/components/fields";
import {
  CalendarDays,
  Check,
  Database,
  Download,
  GripVertical,
  MoreHorizontal,
  Share2,
  SquareKanban,
  Star,
  Trash2,
} from "lucide-react";
import { DataTable } from "@/components/patterns/data-table/data-table";
import { NavRailView } from "@/components/nav-rail";
import {
  DiscussionSection,
  FieldRow,
  FilterBar,
  FilterBarSearch,
  FilterMenu,
  FormActionsFooter,
  MultiSelect,
  PageSection,
  PanelHeader,
  TableEmptyState,
  TableTools,
  useDataTableLayout,
  type FilterConfig,
  type MultiSelectOption,
  type PrimaryColumnDef,
  type TableEmptyReason,
  type TableEmptyStateLabels,
  type TableToolsLabels,
} from "@/components/patterns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DirtyFormBar } from "@/components/dirty-form-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePanelIsMobile, useScreenWidth } from "@/hooks/use-panel-is-mobile";
import { Plus, X } from "lucide-react";
import type { CalendarDef } from "@monark/calendar/contracts";
import { CalendarManageDialog } from "@/app/(authed)/calendar/calendar-manage-dialog";
import { CalendarSidebar, CalendarChip } from "@/app/(authed)/calendar/calendar-sidebar";
import { UserBanner, type UserBannerEditConfig } from "@/components/user-banner";
import { DragHandle } from "@monark/components/ui/drag-handle";
import { BoardArea, BoardColumn, COLUMN_WIDTH_PX, KanbanCard } from "@monark/kanban/client";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stories for the screenshot harness. Each is a plain React component
 * rendering real app components with sample data. Add a story by
 * exporting a component and registering it in `STORIES` below ; the
 * capture script screenshots each registered key at every viewport.
 */

const STATUS = [
  { value: "idea", label: "Idea", tone: "secondary" as const },
  { value: "active", label: "Active", tone: "success" as const },
  { value: "blocked", label: "Blocked", tone: "warning" as const },
];

const TAGS = [
  { value: "web3", label: "Web3" },
  { value: "defi", label: "DeFi" },
  { value: "dao", label: "DAO" },
  { value: "nft", label: "NFT" },
];

const PEOPLE: RelationOption[] = [
  { id: "u1", label: "Ada Lovelace", sublabel: "ada@monark.io" },
  { id: "u2", label: "Alan Turing", sublabel: "alan@monark.io" },
  { id: "u3", label: "Grace Hopper", sublabel: "grace@monark.io" },
];

const relationSource = {
  model: "user",
  loadOptions: async (q: string) =>
    PEOPLE.filter((p) => !q || p.label.toLowerCase().includes(q.toLowerCase())),
  loadByIds: async (ids: string[]) => PEOPLE.filter((p) => ids.includes(p.id)),
};

const FIELDS: FieldDef[] = [
  { type: "text", name: "title", label: "Title", required: true, maxLength: 60 },
  { type: "richText", name: "notes", label: "Notes", placeholder: "Write something…" },
  { type: "number", name: "budget", label: "Budget", min: 0, prefix: "$" },
  { type: "boolean", name: "published", label: "Published" },
  { type: "date", name: "dueDate", label: "Due date" },
  {
    type: "singleSelect",
    name: "status",
    label: "Status",
    options: STATUS,
    required: true,
    badges: true,
  },
  {
    type: "multiSelect",
    name: "tags",
    label: "Tags",
    options: TAGS,
    allowCustom: true,
    badges: true,
  },
  {
    type: "relation",
    name: "owners",
    label: "Owners",
    source: relationSource,
    multiple: true,
    avatars: true,
  },
  { type: "url", name: "website", label: "Website" },
  { type: "email", name: "contact", label: "Contact email" },
];

interface Row {
  id: string;
  title: string;
  budget: number | null;
  published: boolean;
  startsAt: Date | null;
  status: string | null;
  tags: string[];
  owners: RelationOption[];
  website: string;
  contact: string;
}

const ROWS: Row[] = [
  {
    id: "1",
    title: "Genesis DAO",
    budget: 25000,
    published: true,
    startsAt: new Date("2026-01-15T09:00:00"),
    status: "active",
    tags: ["web3", "dao"],
    owners: [PEOPLE[0]!, PEOPLE[2]!],
    website: "https://genesis.example",
    contact: "hello@genesis.example",
  },
  {
    id: "2",
    title: "Yield Router",
    budget: null,
    published: false,
    startsAt: null,
    status: "idea",
    tags: ["defi", "web3", "nft", "dao"],
    owners: [PEOPLE[1]!],
    website: "",
    contact: "",
  },
  {
    id: "3",
    title: "Membership NFT",
    budget: 8000,
    published: true,
    startsAt: new Date("2026-03-01T14:30:00"),
    status: "blocked",
    tags: ["nft"],
    owners: [],
    website: "https://members.example",
    contact: "team@members.example",
  },
];

function Form() {
  return (
    <AutoForm
      fields={FIELDS}
      onSubmit={() => {}}
      onCancel={() => {}}
      submitLabel="Submit"
      cancelLabel="Cancel"
    />
  );
}

const TOOLS_LABELS: TableToolsLabels = {
  tools: "List tools",
  close: "Close",
  columns: "Columns",
  reset: "Reset columns",
  sort: {
    label: "Sorting",
    ascending: "Ascending",
    descending: "Descending",
    none: "No sorting",
    addField: "Add sort field",
    remove: "Remove sort field",
    reset: "Reset sorting",
  },
  filters: {
    trigger: "Filters",
    title: "Filters",
    close: "Close",
    clearAll: "Reset filters",
    resetField: "Reset",
  },
};

const DEMO_PRIMARY: PrimaryColumnDef<Row> = {
  header: "Title",
  label: (r) => r.title,
};

function useDemoColumns() {
  const { labels } = useFieldStrings();
  return [
    fieldColumn<Row>(
      { type: "number", name: "budget", label: "Budget", prefix: "$" },
      { accessor: (r) => r.budget, labels },
    ),
    fieldColumn<Row>(
      { type: "boolean", name: "published", label: "Published" },
      { accessor: (r) => r.published, labels },
    ),
    fieldColumn<Row>(
      { type: "datetime", name: "startsAt", label: "Starts at" },
      { accessor: (r) => r.startsAt, labels },
    ),
    fieldColumn<Row>(
      { type: "singleSelect", name: "status", label: "Status", options: STATUS, badges: true },
      { accessor: (r) => r.status, labels },
    ),
    fieldColumn<Row>(
      { type: "multiSelect", name: "tags", label: "Tags", options: TAGS, badges: true },
      { accessor: (r) => r.tags, labels },
    ),
    fieldColumn<Row>(
      {
        type: "relation",
        name: "owners",
        label: "Owners",
        source: relationSource,
        multiple: true,
        avatars: true,
      },
      { accessor: (r) => r.owners, labels },
    ),
    fieldColumn<Row>(
      { type: "url", name: "website", label: "Website" },
      { accessor: (r) => r.website, labels },
    ),
    fieldColumn<Row>(
      { type: "email", name: "contact", label: "Contact" },
      { accessor: (r) => r.contact, labels },
    ),
  ];
}

function Table() {
  const columns = useDemoColumns();
  return (
    <DataTable<Row>
      data={ROWS}
      getRowId={(r) => r.id}
      storageKey="screenshot-fields"
      primaryColumn={DEMO_PRIMARY}
      columns={columns}
      labels={{ rowActions: "Row actions" }}
    />
  );
}

/** Regression: a narrow selection table (few columns) — the 64px checkbox
 *  column must stay 64px instead of scaling up as the table stretches to fill.
 *  The primary "Title" column absorbs the slack. */
function SelectWidthTable() {
  const layout = useDataTableLayout("screenshot-select-width");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(["1"]));
  return (
    <DataTable<Row>
      data={ROWS}
      getRowId={(r) => r.id}
      storageKey="screenshot-select-width"
      layout={layout}
      selection={{ selectedIds, onSelectedIdsChange: setSelectedIds }}
      primaryColumn={DEMO_PRIMARY}
      columns={[
        {
          id: "budget",
          header: "Budget",
          align: "right",
          size: 140,
          cell: (r) => (r.budget == null ? "—" : `$${r.budget.toLocaleString()}`),
        },
      ]}
      labels={{ rowActions: "Row actions", selectRow: "Select row", selectAll: "Select all rows" }}
    />
  );
}
const SelectColumnWidthStory: FC = () => (
  <div className="p-6">
    <div className="rounded-lg border border-border">
      <SelectWidthTable />
    </div>
  </div>
);

/** Regression: an empty table whose columns overflow its container. The
 *  empty-state message must stay centered on the visible area, not drift with
 *  the (wider-than-viewport) table. Constrained to 720px so the 8 demo columns
 *  overflow and force horizontal scroll. */
function EmptyTable() {
  const columns = useDemoColumns();
  return (
    <DataTable<Row>
      data={[]}
      getRowId={(r) => r.id}
      storageKey="screenshot-empty"
      primaryColumn={DEMO_PRIMARY}
      columns={columns}
      labels={{ rowActions: "Row actions" }}
      emptyState="No records match your filters yet."
    />
  );
}
const EmptyStateStory: FC = () => (
  <div className="p-6">
    <div className="w-[720px] rounded-lg border border-border">
      <EmptyTable />
    </div>
  </div>
);

/** Regression: the row-actions `…` column must stay pinned flush with the
 *  container's right edge and visible even when the 8 demo columns overflow the
 *  720px container (horizontal scroll). The slack absorber sits to its left so
 *  it's also flush when the table is narrower than its container. */
function PinnedActionsTable() {
  const columns = useDemoColumns();
  return (
    <DataTable<Row>
      data={ROWS}
      getRowId={(r) => r.id}
      storageKey="screenshot-pinned-actions"
      primaryColumn={DEMO_PRIMARY}
      columns={columns}
      rowActions={(r) => [
        { label: "Edit", icon: Star, onSelect: () => void r },
        { label: "Share", icon: Share2, onSelect: () => void r },
        {
          label: "Delete",
          icon: Trash2,
          destructive: true,
          separatorBefore: true,
          onSelect: () => void r,
        },
      ]}
      labels={{ rowActions: "Row actions" }}
    />
  );
}
const PinnedActionsStory: FC = () => (
  <div className="p-6">
    <div className="w-[720px] rounded-lg border border-border">
      <PinnedActionsTable />
    </div>
  </div>
);

/** Same pinned-actions table but narrower than its container, so nothing
 *  overflows — the `…` must still be flush-right (slack absorbed to its left,
 *  no empty gutter after it). */
function PinnedActionsNarrowTable() {
  return (
    <DataTable<Row>
      data={ROWS}
      getRowId={(r) => r.id}
      storageKey="screenshot-pinned-actions-narrow"
      primaryColumn={DEMO_PRIMARY}
      columns={[
        {
          id: "budget",
          header: "Budget",
          align: "right",
          size: 140,
          cell: (r) => (r.budget == null ? "—" : `$${r.budget.toLocaleString()}`),
        },
      ]}
      rowActions={(r) => [
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => void r },
      ]}
      labels={{ rowActions: "Row actions" }}
    />
  );
}
const PinnedActionsNarrowStory: FC = () => (
  <div className="p-6">
    <div className="w-[720px] rounded-lg border border-border">
      <PinnedActionsNarrowTable />
    </div>
  </div>
);

/** The full list surface: FilterBar (search + tools cluster + CTA) over the
 *  table, both wired to one shared useDataTableLayout. */
function TableWithToolbar({ width }: { width?: number }) {
  const layout = useDataTableLayout("screenshot-fields");
  const columns = useDemoColumns();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const filters: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      value: status,
      onValueChange: setStatus,
      options: [
        { value: "all", label: "All statuses" },
        ...STATUS.map((s) => ({ value: s.value, label: s.label })),
      ],
    },
  ];
  return (
    <div className="space-y-3" style={width ? { width } : undefined}>
      <FilterBar
        search={<FilterBarSearch value={search} onChange={setSearch} placeholder="Search…" />}
        tools={
          <TableTools
            layout={layout}
            primaryColumn={DEMO_PRIMARY}
            columns={columns}
            filters={filters}
            labels={TOOLS_LABELS}
            include={["filters", "sorting"]}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <TableTools
              layout={layout}
              primaryColumn={DEMO_PRIMARY}
              columns={columns}
              labels={TOOLS_LABELS}
              include={["columns"]}
            />
            <Button>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              New item
            </Button>
          </div>
        }
      />
      <div className="rounded-lg border border-border">
        <DataTable<Row>
          data={ROWS}
          getRowId={(r) => r.id}
          storageKey="screenshot-fields"
          layout={layout}
          primaryColumn={DEMO_PRIMARY}
          columns={columns}
          labels={{ rowActions: "Row actions" }}
        />
      </div>
    </div>
  );
}

const FieldsFormStory: FC = () => (
  <div className="mx-auto max-w-xl p-6">
    <Form />
  </div>
);

const FieldsTableStory: FC = () => (
  <div className="max-w-full p-6">
    <div className="rounded-lg border border-border">
      <Table />
    </div>
  </div>
);

/** Renders the toolbar + table and clicks the toolbar button with the given
 *  aria-label on mount (retrying briefly — the collapsed trigger only appears
 *  after the FilterBar measures itself). StrictMode double-invokes effects,
 *  so a ref guards against a second (toggling) click. */
const TableToolbarOpen: FC<{ trigger: string; width?: number }> = ({ trigger, width }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    let attempts = 0;
    const tryClick = () => {
      const btn = rootRef.current?.querySelector<HTMLButtonElement>(
        `button[aria-label="${trigger}"]`,
      );
      if (btn) {
        btn.click();
      } else if (attempts++ < 10) {
        setTimeout(tryClick, 60);
      }
    };
    setTimeout(tryClick, 60);
  }, [trigger]);
  return (
    <div ref={rootRef} className="max-w-full p-6">
      <TableWithToolbar width={width} />
    </div>
  );
};

const TableToolbarStory: FC = () => (
  <div className="max-w-full p-6">
    <TableWithToolbar />
  </div>
);
const TableToolsSortingStory: FC = () => <TableToolbarOpen trigger="Sorting" />;
const TableToolsColumnsStory: FC = () => <TableToolbarOpen trigger="Columns" />;
/** Constrained row → the three controls collapse into the "List tools"
 *  trigger ; opens its drill-in root. */
const TableToolsCollapsedStory: FC = () => <TableToolbarOpen trigger="List tools" width={560} />;

/** The filter dropdown opened with an active filter, to show the "Clear
 *  filters" action pinned at the bottom (enabled while something is active). */
const SECTORS = Array.from({ length: 18 }, (_, i) => ({
  value: `sector-${i}`,
  label: `Sector ${i + 1}`,
}));

const FilterMenuClearStory: FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [status, setStatus] = useState<string[]>(["sector-0", "sector-3"]);
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    let attempts = 0;
    const tryClick = () => {
      const btn = rootRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Filters"]');
      if (btn) btn.click();
      else if (attempts++ < 10) setTimeout(tryClick, 60);
    };
    setTimeout(tryClick, 60);
  }, []);
  const filters: FilterConfig[] = [
    {
      id: "tags",
      type: "multiSelect",
      label: "Status",
      value: tags,
      onValueChange: setTags,
      // Colored-badge option labels — mirrors how a status field renders
      // everywhere else, so its color is a visual reminder in the filter.
      options: STATUS.map((s) => ({
        value: s.value,
        label: (
          <Badge variant={s.tone} size="sm">
            {s.label}
          </Badge>
        ),
        searchText: s.label,
      })),
    },
    // A long option list so the sticky-bottom "Reset" is visible while the
    // options scroll behind it.
    {
      id: "status",
      type: "multiSelect",
      label: "Sector",
      value: status,
      onValueChange: setStatus,
      options: SECTORS,
    },
  ];
  return (
    <div ref={rootRef} className="flex justify-end p-6">
      <FilterMenu
        filters={filters}
        labels={{
          trigger: "Filters",
          title: "Filters",
          close: "Close",
          clearAll: "Reset filters",
          resetField: "Reset",
          valueCount: (count) => `${count} Active`,
        }}
      />
    </div>
  );
};

/** The standardized right-side panel header in its modes: window controls
 *  (reduce + fullscreen), title + subtitle, back arrow, and right-aligned
 *  actions that overflow into "…" as the panel narrows. */
const PanelHeaderStory: FC = () => {
  const noop = () => {};
  const many = [
    { icon: Star, label: "Favorite", onSelect: noop },
    { icon: Share2, label: "Share", onSelect: noop },
    { icon: Download, label: "Export", onSelect: noop },
    { icon: Check, label: "Approve", onSelect: noop },
    { icon: Trash2, label: "Delete", onSelect: noop, destructive: true },
  ];
  return (
    <div className="space-y-6 p-6">
      <Panel label="Form panel — open full page + close (both right)" width={440}>
        <PanelHeader
          title="Genesis DAO"
          onClose={noop}
          fullPageHref="#"
          fullPageLabel="Open full page"
        />
      </Panel>
      <Panel label="Title + subtitle (App launcher / User menu)" width={440}>
        <PanelHeader title="Monark apps" subtitle="Switch between Monark products" onClose={noop} />
      </Panel>
      <Panel label="Back mode + one action" width={440}>
        <PanelHeader
          title="Notifications"
          onClose={noop}
          left={{ mode: "back", onBack: noop, label: "Back" }}
          actions={[{ icon: Check, label: "Mark all read", onSelect: noop }]}
        />
      </Panel>
      <Panel label="Actions fit (wide, 5 actions)" width={520}>
        <PanelHeader title="Wide panel" onClose={noop} actions={many} maxVisibleActions={5} />
      </Panel>
      <Panel label="Actions overflow into … (narrow)" width={300}>
        <PanelHeader title="Narrow panel" onClose={noop} actions={many} maxVisibleActions={5} />
      </Panel>
    </div>
  );
};

function Panel({ label, width, children }: { label: string; width: number; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="overflow-hidden rounded-lg border border-border" style={{ width }}>
        {children}
      </div>
    </div>
  );
}

/** Seeds a two-level sort (Status ↑, then Budget ↓) via localStorage before the
 *  table hydrates, then opens the Sorting popover to show the active priority
 *  list + the remaining "Add sort field" columns. */
const TableSortingActiveStory: FC = () => {
  useState(() => {
    try {
      localStorage.setItem(
        "screenshot-fields",
        JSON.stringify({
          columnOrder: [],
          columnVisibility: {},
          columnSizing: {},
          sorting: [
            { id: "status", desc: false },
            { id: "budget", desc: true },
          ],
        }),
      );
    } catch {
      // ignore
    }
    return null;
  });
  return <TableToolbarOpen trigger="Sorting" />;
};

/** Mirrors the dev/fields page layout — the responsive grid that must not
 *  overflow on mobile. Use this story to validate the overflow fix. */
const FieldsGalleryStory: FC = () => (
  <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 p-6 lg:grid-cols-2">
    <section className="min-w-0">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Fields</h1>
      <Form />
    </section>
    <section className="min-w-0">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">Table cells</h2>
      <div className="rounded-lg border border-border">
        <Table />
      </div>
    </section>
  </div>
);

// ── Option colors ──────────────────────────────────────────────────────────
// Drives the CHANGED code path : SELECT / MULTI_SELECT `DataField` configs
// carrying a per-option `color`, run through the real `dataFieldToFieldDef`
// adapter (color → tone, `badges` flip), then rendered as both form inputs and
// table cells. A colored badge here means the adapter mapped `color` → `tone`
// and turned `badges` on ; the "Plain select" (no colors) must stay plain text.

const COLORED_FIELDS: DataFieldForAdapter[] = [
  {
    id: "s1",
    key: "status",
    label: "Status (colored)",
    description: null,
    required: false,
    type: "SELECT",
    config: {
      options: [
        { value: "idea", label: "Idea" }, // neutral → no color
        { value: "active", label: "Active", color: "success" },
        { value: "blocked", label: "Blocked", color: "warning" },
        { value: "done", label: "Done", color: "primary" },
        { value: "dropped", label: "Dropped", color: "destructive" },
      ],
    },
  },
  {
    id: "t1",
    key: "tags",
    label: "Tags (colored)",
    description: null,
    required: false,
    type: "MULTI_SELECT",
    config: {
      options: [
        { value: "web3", label: "Web3", color: "primary" },
        { value: "defi", label: "DeFi", color: "success" },
        { value: "dao", label: "DAO", color: "warning" },
        { value: "nft", label: "NFT", color: "outline" },
      ],
    },
  },
  {
    id: "p1",
    key: "plain",
    label: "Plain select (no colors)",
    description: null,
    required: false,
    type: "SELECT",
    config: {
      options: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ],
    },
  },
];

const COLORED_VALUES: Record<string, unknown> = {
  status: "active",
  tags: ["web3", "defi", "dao"],
  plain: "a",
};

const OptionColorsStory: FC = () => {
  const { labels } = useFieldStrings();
  const defs = COLORED_FIELDS.map((f) => dataFieldToFieldDef(f));
  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Select option colors</h1>
        <p className="text-sm text-muted-foreground">
          Configs with a per-option <code>color</code>, through the real adapter.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Record form (inputs)</h2>
        <AutoForm
          fields={defs}
          defaultValues={COLORED_VALUES}
          onSubmit={() => {}}
          onCancel={() => {}}
          submitLabel="Save"
          cancelLabel="Cancel"
        />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Table cells</h2>
        <div className="space-y-3 rounded-md border border-border p-4">
          {defs.map((def) => (
            <div key={def.name} className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-xs text-muted-foreground">{def.label}</span>
              <FieldCell def={def} value={COLORED_VALUES[def.name]} labels={labels} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

// ── Calendar mobile/responsive stories ─────────────────────────────────────
// Validate the responsive calendar work: full-screen modal chrome (left title,
// top-left content, FormActionsFooter banner, close X), the mobile calendar-chip
// strip, and the standardized form footer action order. Each renders at both
// viewports (390 mobile / 1280 desktop), so one story shows both layouts.

const SAMPLE_CALS: CalendarDef[] = [
  { id: "c1", name: "Personal", color: "#6366f1", isPersonal: true },
  { id: "c2", name: "Marketing Events", color: "#f43f5e" },
  { id: "c3", name: "Engineering", color: "#10b981" },
];

const SAMPLE_ROLES = [
  { id: "r1", name: "Admin" },
  { id: "r2", name: "Member" },
  { id: "r3", name: "Viewer" },
];

const noop = () => {};

/** Edit Calendar dialog: full-screen on mobile (left title, top-left fields,
 *  bottom FormActionsFooter banner, top-right close X), centered on desktop. */
const CalendarManageDialogStory: FC = () => (
  <CalendarManageDialog
    open
    calendar={SAMPLE_CALS[1]}
    roles={SAMPLE_ROLES}
    onClose={noop}
    onSave={noop}
    onDelete={noop}
  />
);

/** Sidebar: horizontal calendar-chip strip (with per-chip ⋯) on mobile ;
 *  the vertical aside with mini date-picker + list on desktop. */
const CalendarSidebarStory: FC = () => (
  <CalendarSidebar
    selectedDate={new Date("2026-07-01T12:00:00")}
    onDateChange={noop}
    calendars={SAMPLE_CALS}
    hiddenCalendarIds={new Set(["c3"])}
    onToggleCalendar={noop}
    canManage
    canDelete
    onAddCalendar={noop}
    onEditCalendar={noop}
    onDeleteCalendar={noop}
  />
);

/** The standardized calendar chip in its states: active (tinted), inactive
 *  (dimmed/transparent), a personal calendar (archive disabled), plus the
 *  add-calendar affordance. Shared by the desktop sidebar + the mobile strip. */
const CHIP_LABELS = {
  more: "More options",
  edit: "Edit",
  archive: "Archive",
  show: "Show calendar",
  hide: "Hide calendar",
};
const CalendarChipsStory: FC = () => (
  <div className="space-y-8 p-6">
    {/* Desktop sidebar: full-width, stacked one per row. */}
    <div className="w-[17rem] space-y-1.5 rounded-md border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Desktop sidebar (stacked, full width)
      </p>
      <div className="flex flex-col gap-1.5">
        <CalendarChip
          cal={SAMPLE_CALS[0]!}
          visible
          onToggle={noop}
          onEdit={noop}
          onArchive={noop}
          canDelete
          labels={CHIP_LABELS}
          fullWidth
        />
        <CalendarChip
          cal={SAMPLE_CALS[1]!}
          visible
          onToggle={noop}
          onEdit={noop}
          onArchive={noop}
          canDelete
          labels={CHIP_LABELS}
          fullWidth
        />
        <CalendarChip
          cal={SAMPLE_CALS[2]!}
          visible={false}
          onToggle={noop}
          onEdit={noop}
          onArchive={noop}
          canDelete
          labels={CHIP_LABELS}
          fullWidth
        />
        <button
          type="button"
          className="flex w-full items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <span className="leading-none" aria-hidden>
            +
          </span>
          Add calendar
        </button>
      </div>
    </div>

    {/* Mobile strip: content-width, inline-scrolling. */}
    <div className="max-w-md space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Mobile strip (inline)
      </p>
      <div className="flex flex-row items-center gap-1.5 overflow-x-auto">
        <CalendarChip
          cal={SAMPLE_CALS[0]!}
          visible
          onToggle={noop}
          onEdit={noop}
          onArchive={noop}
          canDelete
          labels={CHIP_LABELS}
        />
        <CalendarChip
          cal={SAMPLE_CALS[1]!}
          visible
          onToggle={noop}
          onEdit={noop}
          onArchive={noop}
          canDelete
          labels={CHIP_LABELS}
        />
        <CalendarChip
          cal={SAMPLE_CALS[2]!}
          visible={false}
          onToggle={noop}
          onEdit={noop}
          onArchive={noop}
          canDelete
          labels={CHIP_LABELS}
        />
      </div>
    </div>
  </div>
);

/** Standardized footer action order: Delete far-left, Cancel + Save right
 *  (Save rightmost) ; and the no-delete (create) variant. */
const FormFooterStory: FC = () => (
  <div className="mx-auto max-w-md space-y-8 p-6">
    <div>
      <p className="mb-2 text-sm text-muted-foreground">Edit (with delete)</p>
      <div className="rounded-lg border border-border p-4">
        <FormActionsFooter
          submitLabel="Save"
          cancelLabel="Cancel"
          onCancel={noop}
          onDelete={noop}
          deleteLabel="Delete"
        />
      </div>
    </div>
    <div>
      <p className="mb-2 text-sm text-muted-foreground">Create (no delete)</p>
      <div className="rounded-lg border border-border p-4">
        <FormActionsFooter submitLabel="Create" cancelLabel="Cancel" onCancel={noop} />
      </div>
    </div>
  </div>
);

/** The standard color input (swatch opens the picker + editable hex field),
 *  shared by Calendars / Roles / Organizations. */
const ColorInputStory: FC = () => {
  const [withValue, setWithValue] = useState("#f0870c");
  const [empty, setEmpty] = useState("");
  const [swatch, setSwatch] = useState("#10b981");
  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">With a value</p>
        <ColorInput value={withValue} onChange={setWithValue} aria-label="Color" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Empty / unset (dashed swatch)</p>
        <ColorInput value={empty} onChange={setEmpty} placeholder="#F0870C" aria-label="Color" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Swatch only</p>
        <ColorInput value={swatch} onChange={setSwatch} swatchOnly aria-label="Color" />
      </div>
    </div>
  );
};

/** Event-popover layout check: on desktop the description editor (`fill`) grows
 *  to match the taller metadata column via the stretched grid cell. */
const EventDescFillStory: FC = () => {
  const fieldStrings = useFieldStrings();
  const [html, setHtml] = useState("<p>Kickoff sync with the design team.</p>");
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-lg border border-border p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">New event</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1.15fr] md:gap-x-4 md:gap-y-0">
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Title</span>
              <div className="h-9 rounded-md border border-input" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              <span className="text-sm font-medium">Description</span>
              <RichTextEditor
                ariaLabel="Description"
                placeholder="Write something…"
                labels={fieldStrings.labels.richText}
                fill
                value={html}
                onChange={setHtml}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {["Calendar", "Starts", "Ends", "Type", "Attendees", "Location"].map((l) => (
              <div key={l} className="flex flex-col gap-1">
                <span className="text-sm font-medium">{l}</span>
                <div className="h-9 rounded-md border border-input" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/** Two small checks: the segmented Type toggle is `h-9` so it aligns with the
 *  neighbouring input, and the MultiSelect renders a per-option `leading`
 *  avatar in both the chip and the dropdown row. */
const ToggleAndAvatarChipsStory: FC = () => {
  const [type, setType] = useState<"STANDARD" | "PUNCTUAL" | "ALL_DAY">("STANDARD");
  const [people, setPeople] = useState<string[]>(["u1", "u3"]);
  const avatar = (color: string) => (
    <span className={cn("h-4 w-4 shrink-0 rounded-full", color)} aria-hidden />
  );
  const options: MultiSelectOption[] = [
    { value: "u1", label: "Ada Lovelace", leading: avatar("bg-rose-500") },
    { value: "u2", label: "Alan Turing", leading: avatar("bg-sky-500") },
    { value: "u3", label: "Grace Hopper", leading: avatar("bg-emerald-500") },
  ];
  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Type</span>
          <div className="flex h-9 rounded-md border border-input">
            {(["STANDARD", "PUNCTUAL", "ALL_DAY"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "flex flex-1 items-center justify-center border-l border-input px-2 text-xs font-medium first:rounded-l-md first:border-l-0 last:rounded-r-md",
                  type === t
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted",
                )}
              >
                {t === "STANDARD" ? "Standard" : t === "PUNCTUAL" ? "Punctual" : "Full day"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Date</span>
          <input
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            defaultValue="2026-07-04"
            readOnly
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Participants</span>
        <MultiSelect
          value={people}
          onChange={setPeople}
          options={options}
          labels={{
            placeholder: "Add someone…",
            add: "Add participant",
            remove: (l) => `Remove ${l}`,
          }}
        />
      </div>
    </div>
  );
};

/** The fake "Discussion" section wrapped in a PageSection, as it appears at
 *  the bottom of the data-model forms (project / industry). */
const DiscussionSectionStory: FC = () => (
  <div className="max-w-xl p-6">
    <PageSection title="Discussion" subtitle="Comments and notes from your team.">
      <DiscussionSection
        disabled
        labels={{
          composerPlaceholder: "Write a comment…",
          submit: "Comment",
          empty: "No comments yet.",
          note: "Preview — commenting isn't enabled yet.",
        }}
        comments={[
          {
            id: "s1",
            authorName: "Ava Martin",
            authorInitials: "AM",
            timeLabel: "2 days ago",
            body: "Nice work getting this shipped. Should we loop in the design team before the next milestone?",
          },
          {
            id: "s2",
            authorName: "Leo Nguyen",
            authorInitials: "LN",
            timeLabel: "yesterday",
            body: "Agreed. I left a couple of notes on the attributes above ; nothing blocking.",
          },
        ]}
      />
    </PageSection>
  </div>
);

/** Repro: the profile UserBanner inside the account layout (fixed w-72 sidebar
 *  + viewport-centered max-w-2xl content). A dashed line marks the content
 *  column's centre so banner/pen alignment is visible without hovering. */
const PROFILE_BANNER_EDIT: UserBannerEditConfig = {
  onBannerFile: () => {},
  onAvatarFile: () => {},
  labels: {
    bannerEditAria: "Edit banner",
    bannerUploadAria: "Upload banner",
    bannerReplace: "Replace",
    bannerRemove: "Remove",
    bannerUploading: "Uploading…",
    avatarEditAria: "Edit avatar",
    avatarUploadAria: "Upload avatar",
    avatarReplace: "Replace",
    avatarRemove: "Remove",
    avatarUploading: "Uploading…",
  },
};
const ProfileBannerLayoutStory: FC = () => (
  <div className="relative min-h-[26rem] w-full">
    <aside className="fixed left-0 top-0 z-20 hidden h-full w-72 border-r border-border bg-muted/40 p-4 xl:block">
      <p className="text-sm font-medium text-muted-foreground">Account nav</p>
    </aside>
    {/* red = viewport centre ; green = centre of the region right of the
        sidebar (where docked content + banner + pen should align). */}
    <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-px -translate-x-1/2 bg-red-500/50" />
    <div className="pointer-events-none absolute inset-y-0 left-[calc(9rem+50%)] z-30 hidden w-px -translate-x-1/2 bg-green-600/70 xl:block" />
    <main className="w-full px-4 pb-20 pt-8 sm:px-6">
      {/* mirrors the fixed PageLayout: dock content past the w-72 rail on xl+ */}
      <div className="xl:pl-72">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <UserBanner
            bannerUrl={null}
            avatarUrl={null}
            displayName="Ada Lovelace"
            email="ada@monark.io"
            subtitle="ada@monark.io"
            edit={PROFILE_BANNER_EDIT}
          />
          <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
            form fields (max-w-2xl) — avatar above should align with this box
          </div>
        </div>
      </div>
    </main>
  </div>
);

/**
 * The shared `DragHandle` grip in both orientations. Static screenshots can't
 * hover, so each grip is forced visible with `active`; the resting (hover-only)
 * state is shown via the outlined hit areas whose grips stay hidden.
 */
const DragHandleStory: FC = () => (
  <div className="mx-auto max-w-xl space-y-8 p-8">
    <div className="space-y-2">
      <p className="text-sm font-medium">Horizontal (calendar event bottom edge)</p>
      <div className="flex items-end gap-6">
        <div className="relative h-16 w-40 rounded-sm border-l-2 border-primary bg-primary/15">
          <DragHandle
            orientation="horizontal"
            active
            className="absolute inset-x-0 bottom-0 h-4 items-end pb-0.5"
          />
        </div>
        <div
          className="relative h-16 w-40 rounded-sm border-l-2"
          style={{ borderLeftColor: "#f43f5e", backgroundColor: "#f43f5e4D" }}
        >
          <DragHandle
            orientation="horizontal"
            color="#f43f5e"
            active
            className="absolute inset-x-0 bottom-0 h-4 items-end pb-0.5"
          />
        </div>
      </div>
    </div>
    <div className="space-y-2">
      <p className="text-sm font-medium">Vertical (panel / column resize edge)</p>
      <div className="flex gap-6">
        <div className="relative h-24 w-56 rounded-lg border border-border">
          <DragHandle
            orientation="vertical"
            active
            className="absolute right-0 top-0 h-full w-1.5"
          />
        </div>
        <div className="relative h-24 w-56 overflow-hidden rounded-lg border border-border">
          {/* `highlight`: tints the full-height rail (as when hovering the panel edge). */}
          <DragHandle
            orientation="vertical"
            active
            highlight
            className="absolute left-0 top-0 h-full w-1.5"
          />
        </div>
        <div className="relative h-24 w-56 rounded-lg border border-border">
          {/* Resting state: grip hidden until hover — hit area outlined so it's locatable. */}
          <DragHandle
            orientation="vertical"
            className="absolute left-0 top-0 h-full w-1.5 bg-muted/40"
          />
        </div>
      </div>
    </div>
  </div>
);

/** The Kanban board primitives (`BoardArea` / `BoardColumn` / `KanbanCard`) with
 *  sample columns and cards — a static, backend-free view of the board layout. */
const KANBAN_COLUMNS = [
  {
    name: "Backlog",
    color: "#6b7280",
    cards: ["Research competitor pricing", "Draft onboarding email"],
  },
  { name: "Todo", color: "#6366f1", cards: ["Wire up the export button", "Fix avatar cropping"] },
  {
    name: "In Progress",
    color: "#f59e0b",
    wipLimit: 2,
    cards: ["Kanban board module", "Billing webhook retries", "Search indexing"],
  },
  { name: "Review", color: "#0ea5e9", cards: ["Rename slug on save"] },
  { name: "Done", color: "#10b981", cards: ["Dark-mode audit", "Ship drag handle chip"] },
];

const KanbanBoardStory: FC = () => (
  <div className="flex h-[560px] flex-col bg-background">
    <BoardArea>
      {KANBAN_COLUMNS.map((col) => (
        <BoardColumn
          key={col.name}
          name={col.name}
          color={col.color}
          count={col.cards.length}
          wipLimit={col.wipLimit}
          dragHandle={
            <button
              type="button"
              aria-label="Reorder column"
              className="-ml-1 shrink-0 rounded p-0.5 text-muted-foreground"
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </button>
          }
          headerRight={
            <button
              type="button"
              aria-label="Column actions"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          }
        >
          {col.cards.map((title, i) => {
            const levels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
            const labels = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
            const level = levels[i % 4]!;
            // Vary the assignee count so the overlapping stack + "+N" overflow
            // are both exercised: 0, 1, 2, then 5 (→ "+2").
            const roster = [
              { name: "Ada Lovelace" },
              { name: "Alan Turing" },
              { name: "Grace Hopper" },
              { name: "Katherine Johnson" },
              { name: "Linus Torvalds" },
            ];
            const counts = [0, 2, 5]; // none, a 2-stack, then 5 (→ "+2" overflow)
            return (
              <KanbanCard
                key={title}
                title={title}
                priority={{ level, label: labels[level] }}
                estimate={i % 2 === 0 ? (i + 1) * 2 + 1 : undefined}
                subtasks={
                  i === 0 ? { done: 2, total: 5 } : i === 1 ? { done: 3, total: 3 } : undefined
                }
                assignees={roster.slice(0, counts[i % counts.length])}
                dueLabel={i === 0 ? "Jul 28" : undefined}
                dueOverdue={i === 0}
              />
            );
          })}
          <button
            type="button"
            className="flex w-full shrink-0 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-3 text-left text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Add card
          </button>
        </BoardColumn>
      ))}
    </BoardArea>
  </div>
);

/** The board's loading skeleton — must mirror the flat, full-height, no-gap
 *  column layout (divider borders, underlined header with a dot + name) so
 *  nothing shifts when the real board loads. Kept in sync with `BoardSkeleton`
 *  in kanban-shell.tsx. */
const KanbanSkeletonStory: FC = () => (
  <div className="flex h-[560px] flex-col bg-background">
    <div className="flex min-h-0 flex-1 overflow-hidden border-t border-border">
      {Array.from({ length: 4 }).map((_, colIndex) => (
        <div
          key={colIndex}
          style={{ width: COLUMN_WIDTH_PX }}
          className="flex h-full shrink-0 flex-col border-r border-border"
        >
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
            <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2">
            {Array.from({ length: 3 - (colIndex % 2) }).map((__, cardIndex) => (
              <Skeleton key={cardIndex} className="h-24 w-full rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** The Kanban card editor's panel chrome — a right-side (desktop) / full-screen
 *  (mobile) Sheet with a `PanelHeader`, a scrollable form body, and a pinned
 *  footer. Mirrors card-editor.tsx's layout (the real editor needs tRPC, so this
 *  renders a representative shell). Validates the panel width, header, and the
 *  footer pinning across the desktop + mobile captures. */
const KanbanCardPanelStory: FC = () => {
  const screenWidth = useScreenWidth();
  const isMobile = usePanelIsMobile(screenWidth);
  const [assignees, setAssignees] = useState<string[]>(["u1", "u2"]);
  const members: MultiSelectOption[] = [
    { value: "u1", label: "Ada Lovelace" },
    { value: "u2", label: "Alan Turing" },
    { value: "u3", label: "Grace Hopper" },
  ];
  return (
    <div className="h-[560px] bg-muted/30">
      <Sheet open modal={isMobile}>
        <SheetContent
          side={isMobile ? "full" : "right"}
          overlay={isMobile}
          hideClose
          aria-describedby={undefined}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-0",
            !isMobile && "w-full sm:max-w-lg",
          )}
          style={isMobile && screenWidth != null ? { maxWidth: screenWidth } : undefined}
        >
          <SheetTitle className="sr-only">Edit card</SheetTitle>
          <PanelHeader title="Edit card" onClose={() => {}} />
          <form className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="s-title">Title</Label>
                <Input id="s-title" defaultValue="Wire up the export button" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="s-status">Status</Label>
                  <Select defaultValue="todo">
                    <SelectTrigger id="s-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: "#3b82f6" }}
                          />
                          Todo
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-estimate">Estimate</Label>
                  <Input id="s-estimate" type="number" defaultValue={3} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="s-priority">Priority</Label>
                  <Select defaultValue="med">
                    <SelectTrigger id="s-priority" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="med">
                        <span
                          className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{ color: "#f59e0b", backgroundColor: "#f59e0b26" }}
                        >
                          Medium
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-due">Due date</Label>
                  <DatePicker
                    id="s-due"
                    value={null}
                    onChange={() => {}}
                    placeholder="Pick a date"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-assignees">Assignees</Label>
                <MultiSelect
                  id="s-assignees"
                  value={assignees}
                  onChange={setAssignees}
                  options={members}
                  labels={{
                    placeholder: "Add assignee…",
                    add: "Add assignee",
                    remove: (name) => `Remove ${name}`,
                    noResults: "No members found",
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Subtasks
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">
                    1/2
                  </span>
                </Label>
                <div className="space-y-1.5">
                  {[
                    { id: "a", title: "Add the API endpoint", done: true },
                    { id: "b", title: "Wire the button", done: false },
                  ].map((st) => (
                    <div key={st.id} className="flex items-center gap-2">
                      <Checkbox checked={st.done} readOnly aria-label="Mark done" />
                      <Input
                        readOnly
                        value={st.title}
                        className={cn("h-9", st.done && "text-muted-foreground line-through")}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-muted-foreground"
                        aria-label="Remove subtask"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="w-full">
                    <Plus className="mr-1 h-4 w-4" aria-hidden />
                    Add subtask
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border p-4 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
              >
                Delete
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
                <Button type="button">Save</Button>
              </div>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
};

/** The four list empty-state reasons — genuinely empty vs. search / filters /
 *  both that filtered everything out — each with its own next-step button. */
const TableEmptyStateStory: FC = () => {
  const labels: TableEmptyStateLabels = {
    noData: { title: "No records yet." },
    noSearch: {
      title: "No results for “quarterly”",
      description: "Check your spelling or try a broader term.",
    },
    noFilters: {
      title: "No matching results",
      description: "Nothing matches the current filters. Try loosening or clearing them.",
    },
    noSearchFilters: {
      title: "No results for “quarterly”",
      description: "Nothing matches your search within the current filters.",
    },
    clearSearch: "Clear search",
    clearFilters: "Clear filters",
    clearAll: "Clear search & filters",
  };
  const reasons: TableEmptyReason[] = ["no-data", "no-search", "no-filters", "no-search-filters"];
  const noop = () => {};
  return (
    <div className="grid max-w-4xl grid-cols-2 gap-4 p-6">
      {reasons.map((reason) => (
        <div key={reason} className="rounded-lg border border-border">
          <div className="border-b border-border px-4 py-2 font-mono text-xs text-muted-foreground">
            {reason}
          </div>
          <div className="px-4 py-10">
            <TableEmptyState
              reason={reason}
              labels={labels}
              onClearSearch={noop}
              onClearFilters={noop}
              createAction={{ label: "New record", onClick: noop, icon: Plus }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

/** The controlled `DatePicker` (used by the kanban card editor) — empty
 *  placeholder state and a chosen-date state with its clear button. */
const DatePickerStory: FC = () => {
  const [empty, setEmpty] = useState<Date | null>(null);
  const [chosen, setChosen] = useState<Date | null>(new Date(2026, 2, 1));
  return (
    <div className="max-w-xs space-y-6 p-6">
      <div className="space-y-1.5">
        <div className="text-sm font-medium">Empty</div>
        <DatePicker
          value={empty}
          onChange={setEmpty}
          placeholder="Pick a date"
          clearLabel="Clear"
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-sm font-medium">Chosen</div>
        <DatePicker
          value={chosen}
          onChange={setChosen}
          placeholder="Pick a date"
          clearLabel="Clear"
        />
      </div>
    </div>
  );
};

/** Desktop app shell: persistent NavRail (left) + offset app bar + content. */
const NavRailShellStory: FC = () => (
  <div>
    <NavRailView
      brandedLogoData={{
        singletonLogoUrl: null,
        singletonDisplayName: "Monark",
        isSingleTenantBootstrapped: false,
      }}
      ariaLabel="Primary navigation"
      brandHomeAria="Home"
      items={[
        { id: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays, active: false },
        { id: "kanban", href: "/kanban", label: "Kanban", icon: SquareKanban, active: false },
        { id: "data", href: "/data", label: "Data", icon: Database, active: true },
      ]}
      admin={{ href: "/admin", label: "Admin", active: false }}
    />
    <div className="md:pl-14">
      {/* Mirrors the real AppBar structure: border-b on the outer <header>,
          the h-14 row inside — so the rail logo's bottom divider must line up
          with this one (they meet where the rail's right edge touches the bar). */}
      <header className="sticky top-0 border-b border-border bg-background">
        <div className="flex h-14 items-center gap-4 px-4">
          <span className="text-sm text-muted-foreground">Data / Projects</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-muted" />
            <div className="h-8 w-8 rounded-full bg-muted" />
          </div>
        </div>
      </header>
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Content area</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The rail is pinned left (md+); the app bar + content offset by its width.
        </p>
      </div>
    </div>
  </div>
);

// The /admin/secrets create panel: a write-only value field (masked), the
// env-var-name field, and the dirty save bar pinned to the panel bottom. Mirrors
// the real SecretForm layout (which is tRPC-coupled, so can't render here).
const SecretPanelStory: FC = () => {
  const [value, setValue] = useState("ghp_examplemaskedtokenvalue");
  return (
    <div className="h-[560px] bg-muted/30 p-6">
      <div className="relative mx-auto flex h-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-background">
        <PanelHeader title="New secret" onClose={() => {}} />
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="@container space-y-5">
            <FieldRow label="Name" htmlFor="story-secret-key">
              <Input id="story-secret-key" defaultValue="GITHUB_TOKEN" className="font-mono" />
              <p className="text-xs text-muted-foreground">
                Letters, digits, and underscores; must start with a letter or underscore.
              </p>
            </FieldRow>
            <FieldRow label="Value" htmlFor="story-secret-value">
              <Input
                id="story-secret-value"
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Stored encrypted; it is never shown again after saving.
              </p>
            </FieldRow>
            <FieldRow label="Description" htmlFor="story-secret-desc">
              <Textarea
                id="story-secret-desc"
                defaultValue="Token for the GitHub issue-creation node."
                rows={3}
              />
            </FieldRow>
          </div>
        </div>
        <DirtyFormBar
          containment="container"
          open
          onSave={() => {}}
          onCancel={() => {}}
          saveLabel="Create"
          cancelLabel="Cancel"
          message="You have unsaved changes"
        />
      </div>
    </div>
  );
};

export const STORIES: Record<string, FC> = {
  "nav-rail": NavRailShellStory,
  "admin-secret-panel": SecretPanelStory,
  "date-picker": DatePickerStory,
  "table-empty-state": TableEmptyStateStory,
  "kanban-board": KanbanBoardStory,
  "kanban-skeleton": KanbanSkeletonStory,
  "kanban-card-panel": KanbanCardPanelStory,
  "drag-handle": DragHandleStory,
  "profile-banner-layout": ProfileBannerLayoutStory,
  "toggle-avatar-chips": ToggleAndAvatarChipsStory,
  "event-desc-fill": EventDescFillStory,
  "fields-form": FieldsFormStory,
  "fields-table": FieldsTableStory,
  "select-column-width": SelectColumnWidthStory,
  "data-table-empty": EmptyStateStory,
  "pinned-actions": PinnedActionsStory,
  "pinned-actions-narrow": PinnedActionsNarrowStory,
  "fields-gallery": FieldsGalleryStory,
  "option-colors": OptionColorsStory,
  "calendar-manage-dialog": CalendarManageDialogStory,
  "calendar-sidebar": CalendarSidebarStory,
  "calendar-chips": CalendarChipsStory,
  "form-footer": FormFooterStory,
  "color-input": ColorInputStory,
  "table-toolbar": TableToolbarStory,
  "table-tools-sorting": TableToolsSortingStory,
  "table-tools-columns": TableToolsColumnsStory,
  "table-tools-collapsed": TableToolsCollapsedStory,
  "filter-menu-clear": FilterMenuClearStory,
  "table-sorting-active": TableSortingActiveStory,
  "panel-header": PanelHeaderStory,
  "discussion-section": DiscussionSectionStory,
};
