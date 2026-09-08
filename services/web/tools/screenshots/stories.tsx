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
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Database,
  Download,
  GripVertical,
  ListFilter,
  MoreHorizontal,
  Share2,
  SquareKanban,
  Star,
  Trash2,
} from "lucide-react";
import { DataTable } from "@/components/patterns/data-table/data-table";
import { NavRailView } from "@/components/nav-rail";
import { QueryBar, type QueryFieldMeta } from "@/components/query/query-bar";
import { QueryChipBar } from "@/components/query/query-chip-bar";
import {
  CreateFab,
  DiscussionSection,
  FieldRow,
  FilterBar,
  FilterBarSearch,
  FilterFieldControl,
  ListMobileBar,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { AuthScreen } from "@/components/auth-screen";
import { BrandedAppLogoView } from "@/components/branded-app-logo-view";

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

// The structured query bar (MonarkQL) : a populated valid query, an invalid
// one (illegal operator → error styling), and the autocomplete popover open on
// a field's value options. Self-driven — seeds each input's text (and focuses
// the last) so the static capture shows all three states.
const QUERY_BAR_FIELDS: QueryFieldMeta[] = [
  { key: "title", label: "Title", kind: "text" },
  { key: "status", label: "Status", kind: "select", options: STATUS },
  { key: "priority", label: "Priority", kind: "number" },
  { key: "tags", label: "Tags", kind: "multiSelect", options: TAGS },
  { key: "done", label: "Done", kind: "boolean" },
  { key: "due", label: "Due date", kind: "date" },
];
const QUERY_BAR_LABELS = {
  placeholder: "Filter… e.g. status:active priority:>3",
  invalid: "Invalid query:",
  fieldsHeading: "Fields",
  valuesHeading: "Values",
  hint: "Type field:value — e.g. status:active, priority:>3, -done:true",
};

const QueryDemoBar: FC<{ initial: string; focus?: boolean }> = ({ initial, focus }) => {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focus) ref.current?.querySelector("input")?.focus();
  }, [focus]);
  return (
    <div ref={ref}>
      <QueryBar
        fields={QUERY_BAR_FIELDS}
        text={text}
        onTextChange={setText}
        onChange={() => {}}
        labels={QUERY_BAR_LABELS}
      />
    </div>
  );
};

const QueryBarStory: FC = () => (
  <div className="flex max-w-xl flex-col gap-6 p-6">
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Valid query</p>
      <QueryDemoBar initial="status:active priority:>3 -done:true" />
    </div>
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Invalid query</p>
      <QueryDemoBar initial="status:>3" />
    </div>
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        Autocomplete: operators + variables
      </p>
      <QueryDemoBar initial="due:" focus />
    </div>
  </div>
);

// The chip / token query editor (MonarkQL) : the same fields the kanban board
// feeds it, seeded so ids resolve to human labels — `Status: Active`,
// `Priority ≥ High`, `Assignee: Ada Lovelace, Grace Hopper` (NOT raw ids) — plus
// the empty "Add filter" state that opens the guided add popover.
const CHIP_BAR_FIELDS: QueryFieldMeta[] = [
  { key: "title", label: "Title", kind: "text" },
  {
    key: "status",
    label: "Status",
    kind: "select",
    options: STATUS.map((s) => ({ value: s.value, label: s.label })),
  },
  {
    key: "assignee",
    label: "Assignee",
    kind: "multiSelect",
    options: [
      { value: "u1", label: "Ada Lovelace" },
      { value: "u2", label: "Alan Turing" },
      { value: "u3", label: "Grace Hopper" },
    ],
    userValued: true,
  },
  {
    key: "priority",
    label: "Priority",
    kind: "orderedSelect",
    options: [
      { value: "LOW", label: "Low" },
      { value: "MEDIUM", label: "Medium" },
      { value: "HIGH", label: "High" },
      { value: "CRITICAL", label: "Critical" },
    ],
  },
  { key: "due", label: "Due date", kind: "date" },
  { key: "estimate", label: "Estimate", kind: "number" },
];

const ChipDemoBar: FC<{ initial: string }> = ({ initial }) => {
  const [text, setText] = useState(initial);
  return (
    <QueryChipBar
      fields={CHIP_BAR_FIELDS}
      text={text}
      onTextChange={setText}
      onChange={() => {}}
      labels={QUERY_BAR_LABELS}
    />
  );
};

const QueryChipBarStory: FC = () => (
  <div className="flex max-w-2xl flex-col gap-6 p-6">
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Resolved chips (ids → names)</p>
      <ChipDemoBar initial="status:active priority:>=HIGH assignee:u1,u3 estimate:>3" />
    </div>
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">Empty — add a filter</p>
      <ChipDemoBar initial="" />
    </div>
  </div>
);

// The kanban top toolbar's responsive layout : desktop keeps the roomy single
// row (board switcher · query · saved views) ; on mobile the three controls stop
// fighting for one row — the switcher leads, the query collapses behind 🔍, and
// the views picker sits in the options slot (shared ListMobileBar). Read the
// MOBILE capture for the fix ; tap-to-expand is shown by `kanban-toolbar-search`.
function KanbanToolbarShell({ expandSearch }: { expandSearch?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const [text, setText] = useState("status:active priority:>=HIGH assignee:u1");
  useEffect(() => {
    if (!expandSearch || done.current) return;
    done.current = true;
    let attempts = 0;
    const tryClick = () => {
      const btn = rootRef.current?.querySelector<HTMLButtonElement>(
        'button[aria-label="Filter cards"]',
      );
      if (btn) btn.click();
      else if (attempts++ < 10) setTimeout(tryClick, 60);
    };
    setTimeout(tryClick, 80);
  }, [expandSearch]);

  const boardSwitcher = (
    <div className="flex min-w-0 items-center rounded-md border border-input bg-background shadow-sm">
      <button
        type="button"
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1.5 pl-3 pr-2 text-sm font-medium hover:bg-accent"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: "#6366f1" }}
        />
        <span className="min-w-0 flex-1 truncate text-left md:max-w-[45dvw] md:flex-none">
          Product Roadmap
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Edit board"
        className="mr-1 shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent"
      >
        <Star className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
  const queryChipBar = (
    <QueryChipBar
      fields={CHIP_BAR_FIELDS}
      text={text}
      onTextChange={setText}
      onChange={() => {}}
      labels={QUERY_BAR_LABELS}
      className="min-w-0 flex-1"
    />
  );
  const viewsMenu = (
    <Button variant="outline" size="sm" className="gap-1.5">
      <Share2 className="h-4 w-4" aria-hidden />
      Views
      <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
    </Button>
  );

  return (
    <div ref={rootRef} className="border-b border-border px-4 py-2">
      <div className="hidden items-center gap-2 md:flex">
        {boardSwitcher}
        {queryChipBar}
        {viewsMenu}
      </div>
      <ListMobileBar
        lead={boardSwitcher}
        search={queryChipBar}
        options={viewsMenu}
        searchLabel="Filter cards"
        closeLabel="Close filter"
      />
    </div>
  );
}
const KanbanToolbarStory: FC = () => <KanbanToolbarShell />;
const KanbanToolbarSearchStory: FC = () => <KanbanToolbarShell expandSearch />;

/**
 * Real-component validation of the simplified mobile list toolbar (the shared
 * `ListMobileBar` + `TableTools mode="sheet"` + `CreateFab`). `ListMobileBar` is
 * `md:hidden`, so read the *mobile* capture. Two variants stack : the data-model
 * bar (Views lead + expandable query + ⋯ options with a Follow section) and the
 * admin bar (search leads, no views). The `list-options-sheet` story auto-opens
 * the ⋯ sheet so its Sort / Columns / Follow sections are visible.
 */
const QUERY_FIELDS_DEMO: QueryFieldMeta[] = [
  { key: "title", label: "Title", kind: "text" },
  {
    key: "status",
    label: "Status",
    kind: "select",
    options: STATUS.map((s) => ({ value: s.value, label: s.label })),
  },
  { key: "budget", label: "Budget", kind: "number" },
  { key: "published", label: "Published", kind: "boolean" },
];

const QUERY_LABELS_DEMO = {
  placeholder: "field:value…",
  invalid: "Invalid query:",
  fieldsHeading: "Fields",
  valuesHeading: "Values",
  hint: "Try status:active budget:>5000",
};

/** Stand-in for the real ViewsMenu lead trigger (the real one needs tRPC). */
function MockViewsLead({ name }: { name: string }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 shadow-sm"
    >
      <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">{name}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/** The "Follow this list" row appended into the ⋯ sheet via `extraSections`. */
function FollowSheetSection() {
  return (
    <div className="space-y-1">
      <h3 className="px-1 text-sm font-semibold text-foreground">Notifications</h3>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <span className="flex items-center gap-2 text-sm">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden /> Follow this list
        </span>
        <Button variant="outline" size="sm">
          Follow
        </Button>
      </div>
    </div>
  );
}

function DataMobileBar() {
  const layout = useDataTableLayout("screenshot-mobilebar-data");
  const columns = useDemoColumns();
  const [q, setQ] = useState("");
  return (
    <ListMobileBar
      searchLabel="Search"
      closeLabel="Close"
      lead={<MockViewsLead name="Active deals" />}
      search={
        <QueryBar
          fields={QUERY_FIELDS_DEMO}
          text={q}
          onTextChange={setQ}
          onChange={() => {}}
          labels={QUERY_LABELS_DEMO}
        />
      }
      options={
        <TableTools
          mode="sheet"
          layout={layout}
          primaryColumn={DEMO_PRIMARY}
          columns={columns}
          labels={TOOLS_LABELS}
          include={["sorting", "columns"]}
          extraSections={<FollowSheetSection />}
        />
      }
    />
  );
}

function AdminMobileBar() {
  const layout = useDataTableLayout("screenshot-mobilebar-admin");
  const columns = useDemoColumns();
  const [s, setS] = useState("");
  const filters: FilterConfig[] = [
    {
      id: "status",
      label: "Status",
      value: "all",
      onValueChange: () => {},
      options: [
        { value: "all", label: "All statuses" },
        ...STATUS.map((x) => ({ value: x.value, label: x.label })),
      ],
    },
  ];
  return (
    <ListMobileBar
      lead={
        <FilterBarSearch
          value={s}
          onChange={setS}
          placeholder="Search organizations…"
          aria-label="Search"
        />
      }
      options={
        <TableTools
          mode="sheet"
          layout={layout}
          primaryColumn={DEMO_PRIMARY}
          columns={columns}
          filters={filters}
          labels={TOOLS_LABELS}
          include={["filters", "sorting", "columns"]}
        />
      }
    />
  );
}

function MobileListToolbarStory() {
  return (
    <div className="space-y-6 p-4">
      <div className="space-y-2">
        <p className="text-xs font-mono text-muted-foreground">
          data list — Views lead / 🔍 / ⋯ (read at mobile width)
        </p>
        <div className="rounded-lg border border-border p-3">
          <DataMobileBar />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-mono text-muted-foreground">admin list — search leads / ⋯</p>
        <div className="rounded-lg border border-border p-3">
          <AdminMobileBar />
        </div>
      </div>
      <CreateFab onClick={() => {}} label="Create" />
    </div>
  );
}

/** Auto-opens the ⋯ options sheet (data variant) so its sections are captured. */
const MobileListOptionsSheetStory: FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    let attempts = 0;
    const tryClick = () => {
      const btn = rootRef.current?.querySelector<HTMLButtonElement>(
        `button[aria-label="${TOOLS_LABELS.tools}"]`,
      );
      if (btn) btn.click();
      else if (attempts++ < 10) setTimeout(tryClick, 60);
    };
    setTimeout(tryClick, 80);
  }, []);
  return (
    <div ref={rootRef} className="p-4">
      <DataMobileBar />
    </div>
  );
};

/** Mobile-UX pass verification. The mobile capture emulates a coarse pointer,
 *  so `pointer-coarse:` touch-target minimums (≥44px) render. Shows: button hit
 *  areas (incl. a `h-7` row-action and `h-5` file-remove that keep a small
 *  visual but a 44px tap floor), and AutoForm's mobile sticky save bar. */
function MobileUxStory() {
  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <p className="text-xs font-mono text-muted-foreground">
          touch targets — coarse pointer floors at ~44px
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Default</Button>
          <Button variant="outline">Outline</Button>
          <Button size="sm">Small</Button>
          <Button size="icon" aria-label="add">
            <Plus />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="row menu">
            <MoreHorizontal />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="remove">
            <X />
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-mono text-muted-foreground">
          AutoForm — save bar sticks to the bottom on mobile
        </p>
        <div className="h-80 overflow-y-auto rounded-lg border border-border px-6 py-6">
          <Form />
        </div>
      </section>
    </div>
  );
}

/** Auto-open a plain (non-fullscreen) dialog to show the mobile gutter + rounded
 *  corners + the enlarged close hit area. */
const MobileDialogStory: FC = () => (
  <div className="p-4">
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>
            On a phone this now keeps a 1rem gutter, rounded corners, and a larger close target.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Body content goes here.</p>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
);

/** Date filter now uses the styled Calendar popover (was a native
 *  `<input type="date">`). Auto-opens the picker so the calendar is captured. */
const FilterDateStory: FC = () => {
  const [value, setValue] = useState("2026-08-12");
  const rootRef = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    let attempts = 0;
    const open = () => {
      // The date trigger is portaled inside the PopoverContent, so search the
      // whole document for the button showing the formatted date.
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) =>
        /2026/.test(b.textContent ?? ""),
      );
      if (btn) btn.click();
      else if (attempts++ < 15) setTimeout(open, 60);
    };
    setTimeout(open, 120);
  }, []);
  const filter: FilterConfig = {
    id: "due",
    label: "Due date",
    type: "date",
    value,
    onValueChange: setValue,
  };
  // Nested inside an open Popover to exercise the real composition (the calendar
  // popover opens *inside* the collapsed-tools popover / dropdown submenu). If
  // the parent panel stays put with the calendar open on top, nesting is safe.
  return (
    <div ref={rootRef} className="p-6">
      <Popover open>
        <PopoverTrigger asChild>
          <button type="button" className="rounded-md border border-input px-3 py-1.5 text-sm">
            Filters
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <FilterFieldControl
            filter={filter}
            labels={{
              trigger: "Filters",
              close: "Close",
              resetField: "Reset",
              pickDate: "Pick a date",
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
};

/** Control-height alignment: a board-selector-style bordered control, a search
 *  input, and a Views button share one height — h-9 (36px) on desktop, ~44px on
 *  the mobile viewport (read both captures). Mirrors the kanban toolbar. */
function ControlHeightsStory() {
  return (
    <div className="space-y-3 p-6">
      <p className="text-xs font-mono text-muted-foreground">
        board selector · search · views — one height (36px desktop / 44px mobile)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm max-md:min-h-11 pointer-coarse:min-h-11">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          Board name
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <Input placeholder="Search…" className="w-40" />
        <Button variant="outline" className="gap-1.5">
          <Bell className="h-4 w-4" aria-hidden />
          Views
        </Button>
      </div>
    </div>
  );
}

/**
 * The pre-auth screen shell — a stand-in for the real signin page (whose
 * form is a server component). What this validates is the animated brand
 * aurora behind the card, the corner-parked brand mark, and the contrast
 * of the card over the washes in light and dark. The drift is frozen
 * wherever the capture lands, so treat the framing as one sample of the
 * animation, not the whole of it.
 */
const AuthScreenStory: FC = () => (
  <AuthScreen
    brand={
      <BrandedAppLogoView
        data={{
          singletonLogoUrl: null,
          singletonDisplayName: null,
          isSingleTenantBootstrapped: false,
        }}
        size={36}
      />
    }
    title="Sign in"
    subtitle="Welcome back."
    footer={
      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account? <span className="font-medium text-primary">Sign up</span>
      </p>
    }
  >
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="story-email">Email</Label>
        <Input id="story-email" defaultValue="ada@example.com" />
      </div>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="story-password">Password</Label>
          <span className="text-xs font-medium text-primary">Forgot password?</span>
        </div>
        <Input id="story-password" type="password" defaultValue="password" />
      </div>
      <Button className="w-full">Sign in</Button>
    </div>
  </AuthScreen>
);

export const STORIES: Record<string, FC> = {
  "auth-screen": AuthScreenStory,
  "control-heights": ControlHeightsStory,
  "filter-date": FilterDateStory,
  "mobile-ux": MobileUxStory,
  "mobile-dialog": MobileDialogStory,
  "mobile-list-toolbar": MobileListToolbarStory,
  "list-options-sheet": MobileListOptionsSheetStory,
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
  "query-bar": QueryBarStory,
  "query-chip-bar": QueryChipBarStory,
  "kanban-toolbar": KanbanToolbarStory,
  "kanban-toolbar-search": KanbanToolbarSearchStory,
};
