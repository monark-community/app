# @monark/components

App-specific UI compositions built on top of [`@monark/ui`](https://github.com/scintillar-com/registry-shell) (the Scintillar shadcn-compatible registry).

## What lives here

- **Primitives** installed via shadcn CLI into [`src/ui/`](src/ui/) from the `@monark/ui` registry declared in [`components.json`](components.json), plus a few hand-authored ones (see [`DragHandle`](src/ui/drag-handle.tsx)).
- **Compositions** in [`src/compositions/`](src/compositions/); app-specific multi-primitive patterns (app shell, org switcher, role-specific layouts) that don't belong in `@monark/ui`.
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

Individual business components (e.g. `<VoteBallot>`) live in the owning module's `/client`, not here. When a composition in here feels generic enough to belong in `@monark/ui`, promote it upstream.

## Adding a new shadcn component

```bash
pnpm --filter @monark/components exec shadcn add <name>
```

Resolves against the `@monark` registry mapped in `components.json`.
