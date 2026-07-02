# Screenshot harness

A lightweight tool to screenshot the app's **real components in isolation**
for visual validation — no Next server, no tRPC, no backend, no auth.

It boots a standalone Vite server that mounts a chosen "story" (a
component + sample data) with the app's real global stylesheet and i18n
provider, then drives headless Chromium to capture it at mobile and
desktop widths.

## Usage

```bash
pnpm screenshots                 # all stories, light theme, both viewports
pnpm screenshots fields-gallery  # a single story
pnpm screenshots --dark          # also capture the dark theme
```

Output PNGs land in `tools/screenshots/out/` (git-ignored), named
`<story>-<viewport>[-dark].png`.

One-time prerequisite (if not already present):

```bash
npx playwright install chromium
```

## Adding a story

Stories live in [`stories.tsx`](./stories.tsx). Export a React component
and register it in the `STORIES` map:

```tsx
const MyStory: FC = () => <MyComponent {...sampleProps} />;

export const STORIES: Record<string, FC> = {
  // …
  "my-story": MyStory,
};
```

The capture script screenshots every registered key. To add a viewport,
edit `VIEWPORTS` in [`capture.mjs`](./capture.mjs).

## How it works / limits

- [`vite.config.ts`](./vite.config.ts) aliases `@` → `src` and stubs the
  Next-only modules (`next/link`, `next/navigation`, `server-only`) so
  component imports resolve in a plain browser. Tailwind is reused via
  the web package's `postcss.config.mjs`.
- [`main.tsx`](./main.tsx) reads `?story=&theme=` and mounts the story
  inside `NextIntlClientProvider` (so `useTranslations` works) with
  `globals.css` applied.
- Because there's no Next runtime, anything that needs a live tRPC query,
  server data, or the router won't function — give components sample data
  (relation fields take async `loadOptions`/`loadByIds`, so pass an
  in-memory list). `next/font` isn't loaded, so text renders in a
  fallback font (fine for layout validation).
- The tool lives outside `src/`, so it's excluded from `typecheck` and
  `lint` and doesn't affect the pre-PR gate.
