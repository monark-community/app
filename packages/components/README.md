# @monark/components

App-specific UI primitives ; shadcn components are pulled from the `@monark` registry (served at `https://ui.monark.io/r/{name}.json`) declared in [`components.json`](components.json).

## What lives here

- **Primitives** in [`src/ui/`](src/ui/), reachable via the `./ui/*` subpath ; today these are the hand-authored [`DragHandle`](src/ui/drag-handle.tsx) and [`VariableInput`](src/ui/variable-input.tsx) ; shadcn-CLI installs from the `@monark` registry declared in [`components.json`](components.json) land here as they are added.
- **Compositions** would live in [`src/compositions/`](src/compositions/) (the `./compositions/*` subpath is already declared in [`package.json`](package.json)) ; none ship yet.
- **`cn` helper** ([`src/lib/cn.ts`](src/lib/cn.ts)); `clsx` + `tailwind-merge` wrapper.

### `DragHandle`

The standard chip-style grab affordance for the app's resizable / draggable edges — the little pill on a calendar event's bottom edge and on the detail panel and table-column resize edges. Import via the `ui/*` subpath:

```tsx
import { DragHandle } from "@monark/components/ui/drag-handle";

// Bottom resize edge of a calendar event (tinted with the event's colour):
<DragHandle orientation="horizontal" color={event.color} active={selected} className="absolute inset-x-0 bottom-0 h-4 items-end pb-0.5" onPointerDown={…} />

// Left / right resize edge of a panel or column (neutral grip, reveals on hover):
<DragHandle orientation="vertical" active={isResizing} className="absolute right-0 top-0 h-full w-1.5" onMouseDown={…} />
```

`DragHandle` renders the interactive hit area — the caller positions and sizes it with `className` and wires the drag with the usual pointer handlers (forwarded to the hit area). The grip reveals on hover (and on touch devices, where there is no hover) unless `active` forces it visible. `orientation` sets the grip's shape and default resize cursor; `color` overrides the neutral grip tint; `highlight` additionally tints the whole strip on hover / while `active` — nice on a long rail like the detail-panel resize edge, best left off for short edges. Because Tailwind v4 doesn't scan symlinked workspace packages, the consuming app must register this package with an `@source` directive (the web app does so in `globals.css`).

### `VariableInput`

A text field whose `{{ … }}` tokens render as atomic, styled **chips** while the rest stays free-editable text — the "variable chip input" behind the automation editor's config fields, but generic (no automation coupling). The value is a plain string, so it drops in anywhere a string field lives; the chips are a presentation layer over that string.

```tsx
import { VariableInput, type VariableInputHandle } from "@monark/components/ui/variable-input";

<VariableInput
  value={value}
  onChange={setValue}
  multiline
  placeholder="Message body…"
  resolveToken={(raw) => ({ label: friendlyLabel(raw), invalid: !isKnown(raw) })}
  suggestions={available} // [{ token, label, group?, hint? }] — typing `{{` opens the menu
  onFocusRegister={(handle) => (activeRef.current = handle)} // a picker inserts via handle.insertToken(raw)
/>;
```

It's a `contentEditable` surface kept _uncontrolled_ while typing (React never re-renders it mid-keystroke, which would drop the caret): edits serialize back out through `onChange`, and the DOM is only rebuilt from `value` when `value` changes externally (a picker insert, a parent reset). A chip is one unit — Backspace/Delete at its edge removes the whole token — and paste comes in as plain text. `resolveToken` maps a raw token (`"{{ steps.find.id }}"`) to its chip `label` + `invalid` state, so the caller owns naming and validity without the component knowing the token grammar. On focus it hands out a `VariableInputHandle` (via `onFocusRegister`) so a variable picker elsewhere can insert a token at the caret; `multiline` toggles single-line vs. a wrapping body.

Passing **`suggestions`** turns on an inline autocomplete: typing `{{` opens a menu under the field (grouped by each suggestion's `group`) filtered by what follows, and Arrow/Enter or a click inserts the row's `token` as a chip in place of the `{{ draft` — so the author picks a connected node and its variable without leaving the field. The pure `tokenizeValue` / `serializeEditor` / `activeQueryAt` / `filterSuggestions` helpers are exported for testing. Same Tailwind `@source` caveat as `DragHandle` (the consuming app scans this package).

Individual business components (e.g. `<VoteBallot>`) live in the owning module's `/client`, not here. When a composition in here feels generic enough to belong in `@monark/ui`, promote it upstream.

## Adding a new shadcn component

```bash
pnpm --filter @monark/components exec shadcn add <name>
```

Resolves against the `@monark` registry mapped in `components.json`.
