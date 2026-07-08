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
import { Check, Download, Share2, Star, Trash2 } from "lucide-react";
import { DataTable } from "@/components/patterns/data-table/data-table";
import {
  DiscussionSection,
  FilterBar,
  FilterBarSearch,
  FilterMenu,
  FormActionsFooter,
  MultiSelect,
  PageSection,
  PanelHeader,
  TableTools,
  useDataTableLayout,
  type FilterConfig,
  type MultiSelectOption,
  type PrimaryColumnDef,
  type TableToolsLabels,
} from "@/components/patterns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { CalendarDef } from "@monark/calendar/contracts";
import { CalendarManageDialog } from "@/app/(authed)/calendar/calendar-manage-dialog";
import { CalendarSidebar, CalendarChip } from "@/app/(authed)/calendar/calendar-sidebar";
import { UserBanner, type UserBannerEditConfig } from "@/components/user-banner";
import { DragHandle } from "@monark/components/ui/drag-handle";

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
          />
        }
        actions={
          <Button>
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            New item
          </Button>
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
    {
      id: "tags",
      type: "multiSelect",
      label: "Tags",
      value: tags,
      onValueChange: setTags,
      options: TAGS,
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

export const STORIES: Record<string, FC> = {
  "drag-handle": DragHandleStory,
  "profile-banner-layout": ProfileBannerLayoutStory,
  "toggle-avatar-chips": ToggleAndAvatarChipsStory,
  "event-desc-fill": EventDescFillStory,
  "fields-form": FieldsFormStory,
  "fields-table": FieldsTableStory,
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
