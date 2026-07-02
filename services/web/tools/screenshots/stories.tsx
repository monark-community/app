import type { FC } from "react";
import { useState } from "react";
import { ColorInput } from "@/components/ui/color-input";
import {
  AutoForm,
  fieldColumn,
  useFieldStrings,
  type FieldDef,
  type RelationOption,
} from "@/components/fields";
import { DataTable } from "@/components/patterns/data-table/data-table";
import { FormActionsFooter } from "@/components/patterns";
import type { CalendarDef } from "@monark/calendar/contracts";
import { CalendarManageDialog } from "@/app/(authed)/calendar/calendar-manage-dialog";
import { CalendarSidebar } from "@/app/(authed)/calendar/calendar-sidebar";

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

function Table() {
  const { labels } = useFieldStrings();
  const columns = [
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
  return (
    <DataTable<Row>
      data={ROWS}
      getRowId={(r) => r.id}
      storageKey="screenshot-fields"
      primaryColumn={{ header: "Title", label: (r) => r.title }}
      columns={columns}
      labels={{
        columns: "Columns",
        reset: "Reset layout",
        rowActions: "Row actions",
        openPanel: "Open",
      }}
    />
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

export const STORIES: Record<string, FC> = {
  "fields-form": FieldsFormStory,
  "fields-table": FieldsTableStory,
  "fields-gallery": FieldsGalleryStory,
  "calendar-manage-dialog": CalendarManageDialogStory,
  "calendar-sidebar": CalendarSidebarStory,
  "form-footer": FormFooterStory,
  "color-input": ColorInputStory,
};
