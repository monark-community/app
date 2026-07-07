"use client";

/**
 * Dev-only gallery for the `@/components/fields` toolkit. Renders an
 * `AutoForm` with one of every field type plus a `DataTable` whose
 * columns are built with `fieldColumn`, so every input and cell can be
 * exercised by hand. Not linked in navigation ; copy here is inline
 * dev scaffolding, not user-facing product text.
 */

import { useMemo } from "react";
import { toast } from "sonner";
import type { FieldValues } from "react-hook-form";
import {
  AutoForm,
  fieldColumn,
  useFieldStrings,
  type FieldDef,
  type RelationOption,
} from "@/components/fields";
import {
  DataTable,
  FilterBar,
  TableTools,
  useDataTableLayout,
  type PrimaryColumnDef,
} from "@/components/patterns";

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

async function loadPeople(query: string): Promise<RelationOption[]> {
  const q = query.trim().toLowerCase();
  return PEOPLE.filter((p) => !q || p.label.toLowerCase().includes(q));
}
async function peopleByIds(ids: string[]): Promise<RelationOption[]> {
  return PEOPLE.filter((p) => ids.includes(p.id));
}

const relationSource = {
  model: "user",
  loadOptions: loadPeople,
  loadByIds: peopleByIds,
};

const FIELDS: FieldDef[] = [
  {
    type: "text",
    name: "title",
    label: "Title",
    required: true,
    maxLength: 60,
    description: "A short single-line text.",
  },
  { type: "longText", name: "summary", label: "Summary", maxLength: 280, rows: 3 },
  {
    type: "richText",
    name: "notes",
    label: "Notes",
    placeholder: "Write something…",
    description: "WYSIWYG rich-text editor (Tiptap).",
  },
  {
    type: "number",
    name: "budget",
    label: "Budget",
    min: 0,
    max: 1_000_000,
    prefix: "$",
    description: "Formatted number with a prefix.",
  },
  { type: "number", name: "seats", label: "Seats", integer: true, min: 1, suffix: "ppl" },
  { type: "boolean", name: "published", label: "Published", description: "Settings-style switch." },
  { type: "date", name: "dueDate", label: "Due date" },
  { type: "datetime", name: "startsAt", label: "Starts at" },
  {
    type: "singleSelect",
    name: "status",
    label: "Status",
    options: STATUS,
    required: true,
    badges: true,
    description: "Colored badges in the dropdown.",
  },
  {
    type: "multiSelect",
    name: "tags",
    label: "Tags",
    options: TAGS,
    allowCustom: true,
    max: 5,
    badges: true,
    description: "Colored badge chips + custom values.",
  },
  {
    type: "relation",
    name: "owners",
    label: "Owners",
    source: relationSource,
    multiple: true,
    avatars: true,
    description: "Async relation with avatars.",
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

export default function FieldsGalleryPage() {
  const { labels } = useFieldStrings();

  const columns = useMemo(
    () => [
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
    ],
    [labels],
  );

  const layout = useDataTableLayout("dev-fields-gallery");

  const primaryColumn: PrimaryColumnDef<Row> = {
    header: "Title",
    label: (r) => r.title,
  };

  function onSubmit(values: FieldValues) {
    toast.success("Submitted (see console)");
    console.log("AutoForm values", values);
  }

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 p-6 lg:grid-cols-2">
      <section className="min-w-0">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Fields gallery</h1>
        <p className="mb-6 text-sm text-muted-foreground">One AutoForm with every field type.</p>
        <AutoForm
          fields={FIELDS}
          onSubmit={onSubmit}
          onCancel={() => toast("Cancelled")}
          submitLabel="Submit"
          cancelLabel="Cancel"
        />
      </section>

      <section className="min-w-0">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">Table cells</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          A DataTable whose columns are built with fieldColumn.
        </p>
        <div className="space-y-3">
          <FilterBar
            tools={
              <TableTools
                layout={layout}
                primaryColumn={primaryColumn}
                columns={columns}
                labels={{
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
                }}
              />
            }
          />
          <DataTable<Row>
            data={ROWS}
            getRowId={(r) => r.id}
            storageKey="dev-fields-gallery"
            layout={layout}
            primaryColumn={primaryColumn}
            columns={columns}
            labels={{ rowActions: "Row actions" }}
          />
        </div>
      </section>
    </div>
  );
}
