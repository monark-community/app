# Fields — reusable form inputs & table cells

A descriptor-driven field toolkit for the web app. One **field-type
registry** drives both a schema-driven form (`AutoForm`) and matching
data-table cells (`fieldColumn`), so a record can be rendered from its
field definitions in either surface. Built for the upcoming polymorphic
Data Model : a server field definition maps 1:1 onto a `FieldDef`.

Import from the barrel : `import { AutoForm, fieldColumn, … } from "@/components/fields"`.

## What's here

- **`types.ts`** — the `FieldDef` discriminated union (the 12 field
  types), option / relation types, `defaultValueFor`, and the text-free
  chrome contracts (`FieldLabels`, `FieldMessages`).
- **`registry.tsx`** — `FieldInput` (def → form input) + `FIELD_TYPE_META`.
  The single seam the polymorphic layer plugs into.
- **`schema.ts`** — `schemaFor` / `schemaForFields` (def → zod fragment).
- **`inputs/*`** — one RHF-bound input component per field type, each
  wrapped in `FieldShell` (label + control + help + error).
- **`cells.tsx`** — `renderFieldValue` / `FieldCell` (def + value → cell).
- **`rich-text-view.tsx`** — `RichTextView`, sanitized read-only renderer for
  a `richText` value ; `rich-text.ts` — `htmlToText` (strip to text).
- **`field-column.ts`** — `fieldColumn(def, opts)` → a `DataColumnDef`
  for `DataTable`, with the typed cell, a derived `sortAccessor`, and
  alignment.
- **`auto-form.tsx`** — `AutoForm`, the schema-driven create/edit form.
- **`strings.tsx`** — `useFieldStrings()`, builds the localized chrome
  bundle from the `fields` i18n namespace.

## Field types

| Type           | Form control                | Cell                      | Notes                                                                                             |
| -------------- | --------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `text`         | `Input`                     | truncated text            | char counter when `maxLength` set                                                                 |
| `longText`     | `Textarea` (auto-grow)      | muted truncated           | char counter                                                                                      |
| `richText`     | Tiptap WYSIWYG + toolbar    | plain-text preview        | stores sanitized HTML ; render read-only with `RichTextView`                                      |
| `number`       | affixed `Input`             | right-aligned, formatted  | `min`/`max`/`step`/`integer`/`prefix`/`suffix`                                                    |
| `boolean`      | `Switch` (or `checkbox`)    | check / dash icon         | settings-style row                                                                                |
| `date`         | `Popover` + `Calendar`      | `Intl` date, muted        | clear button                                                                                      |
| `datetime`     | `Calendar` + `TimePicker`   | `Intl` date-time          |                                                                                                   |
| `singleSelect` | `Select` / combobox / radio | `Badge` (optional `tone`) | combobox above 8 options or `searchable` ; `badges` renders colored option badges                 |
| `multiSelect`  | chips + `Command`           | chips + `+N` overflow     | `allowCustom` adds a create row ; `max` ; `badges` colors option/chip badges                      |
| `relation`     | async `Command` combobox    | resolved chips + `+N`     | `source.loadOptions` / `loadByIds` ; `multiple`/`max` ; `avatars` shows image-or-initials avatars |
| `url`          | icon `Input`                | link with icon            | http(s) validated                                                                                 |
| `email`        | icon `Input`                | `mailto:` link            | format validated                                                                                  |

## Usage

### A form

```tsx
const fields: FieldDef[] = [
  { type: "text", name: "title", label: t("title"), required: true, maxLength: 120 },
  { type: "url", name: "url", label: t("url") },
  { type: "singleSelect", name: "status", label: t("status"),
    options: STATUS.map((s) => ({ value: s, label: tStatus(s) })) },
  { type: "relation", name: "industryIds", label: t("industries"), multiple: true,
    source: { model: "industry", loadOptions, loadByIds } },
]

<AutoForm
  fields={fields}
  defaultValues={initial}
  onSubmit={(values) => mutation.mutate(values)}
  onCancel={close}
  submitLabel={t("save")}
  cancelLabel={t("cancel")}
  isBusy={mutation.isPending}
/>
```

`AutoForm` builds the zod resolver from the registry, seeds each field's
empty default, and wires `FormActionsFooter` + `ConfirmDialog`. Field
`label` / `description` / `placeholder` are passed already-translated ;
internal chrome (search box, "No results", counters, validation
messages) comes from `useFieldStrings()`.

### A table column

```tsx
const columns = [
  fieldColumn(statusField, { accessor: (r) => r.status, labels }),
  fieldColumn(updatedField, { accessor: (r) => r.updatedAt, labels }),
];
// labels = useFieldStrings().labels  (CellLabels: empty / yes / no / more)
```

Relation columns must receive **already-resolved** `RelationOption`(s)
from their accessor — a cell cannot fetch.

## Conventions

- **Text-free.** Components never hardcode visible copy ; all chrome
  flows through `useFieldStrings()` (the `fields` i18n namespace, en + fr).
- **Accessible.** Every control associates its `Label` via
  `FormControl`/`FormLabel` ; errors surface through `FormMessage`
  (`aria-describedby`). Comboboxes are keyboard-navigable (cmdk).
- **Strict TS.** No `any` ; the registry switch narrows the `FieldDef`
  union so each branch is precisely typed.

## Extending

To add a field type : add a variant to the `FieldDef` union
(`types.ts`), a `defaultValueFor` case, a branch in `schemaFor`, an
input component under `inputs/`, a `FieldInput` case, a `renderFieldValue`
case, and a `FIELD_TYPE_META` entry. The type checker flags every switch
you miss.
