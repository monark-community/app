# @monark/components

App-specific UI compositions built on top of [`@monark/ui`](https://github.com/scintillar-com/registry-shell) (the Scintillar shadcn-compatible registry).

## What lives here

- **Primitives** installed via shadcn CLI into [`src/ui/`](src/ui/) from the `@monark/ui` registry declared in [`components.json`](components.json).
- **Compositions** in [`src/compositions/`](src/compositions/); app-specific multi-primitive patterns (app shell, org switcher, role-specific layouts) that don't belong in `@monark/ui`.
- **`cn` helper** ([`src/lib/cn.ts`](src/lib/cn.ts)); `clsx` + `tailwind-merge` wrapper.

Individual business components (e.g. `<VoteBallot>`) live in the owning module's `/client`, not here. When a composition in here feels generic enough to belong in `@monark/ui`, promote it upstream.

## Adding a new shadcn component

```bash
pnpm --filter @monark/components exec shadcn add <name>
```

Resolves against the `@monark` registry mapped in `components.json`.
