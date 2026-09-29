# Theming: two sources, one token set

Brand color arrives from two places, and they feed **the same token set** ;
`--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`,
`--sidebar-ring`, `--chart-1`, `--brand-primary`, `--brand-accent`,
`--brand-foreground`. [The root layout](../../../services/web/src/app/layout.tsx)
sets only the per-theme brand inputs on `<html>` (`--brand-light` /
`--brand-dark`, their foregrounds and accents, see "One brand, two themes"
below), and [`globals.css`](../../../services/web/src/app/globals.css) maps them
onto that token set for the active theme :

- **The singleton organization's `primaryColor`** (runtime : set in-app, or at
  provisioning via `INITIAL_ORG_PRIMARY_COLOR`) wins when it is set.
- **`BRANDING_PRIMARY`** (deploy time, via env) is used when it isn't. This is
  what themes a deploy before its organization is provisioned, and every
  pre-auth surface that renders without one.

Either way the foreground painted on top is computed from WCAG relative
luminance, so a light or pastel brand color still yields legible buttons.
`BRANDING_ACCENT` is the second stop of the gradient surfaces and the fill of
the notification badge. It is chosen to pair with `BRANDING_PRIMARY`, so it
applies only while that primary is in use ; once the organization sets its own
`primaryColor`, the org color stands in for both (a deployment accent would no
longer pair with anything on screen, and `--brand-foreground`, computed for the
primary, might not read on it).

The values in
[`globals.css`](../../../services/web/src/app/globals.css) are the neutral fallback
for surfaces rendered outside that layout (the component screenshot harness, for
instance) : the app itself always gets the tokens above.

## Brand-tinted surfaces

Only the primary family is set per brand ; every other color token in
[`globals.css`](../../../services/web/src/app/globals.css) (`--background`,
`--card`, `--popover`, `--secondary` / `--muted` / `--accent`, `--border`,
`--input`, `--foreground`, `--muted-foreground`, the sidebar surfaces) is
**derived from `--primary`** with CSS relative color syntax :

```css
--background: oklch(from var(--primary) 0.985 calc(c * 0.06 * var(--surface-tint)) h);
```

Each token keeps a **fixed lightness** (so contrast never depends on the brand),
takes the brand's **hue**, and a small **fraction of its chroma**. Dark mode uses
larger fractions, because a small tint on a near-black ground reads as grey. The
result : an orange brand gets warm cream surfaces in light mode and espresso in
dark mode, a blue brand cool ones, a grey brand neutral ones.

`--surface-tint` scales every fraction at once : `0` is plain neutral grey, `1`
the default, `2` the strongest. Like the color, it comes from two sources :

- **The singleton organization's `surfaceTint`** (`Organization.surfaceTint`,
  set with the slider on the organization page) wins when it is set.
- **`BRANDING_SURFACE_TINT`** (deploy time) otherwise ; unset means `1`.

The root layout clamps the value to 0..2 and also writes the deployment default
to `data-brand-default-tint` on `<html>`, next to `data-brand-org` (the org the
tokens come from). The organization page reads both to
**live-preview unsaved edits** : [`useBrandPreview`](../../../services/web/src/lib/brand-preview.ts)
overlays the edited primary / tint on `<html>`'s inline style, restores the
server values on cancel or unmount, and a successful brand save reloads the page
so the server-rendered tokens match.

**Brand-colored text.** A light brand (orange, yellow) fails WCAG AA as text on
a near-white ground, and a dark one (black, navy) vanishes on a near-black
ground, so `--primary-ink` adjusts the brand's lightness per theme : capped at
0.55 in light mode, raised to at least 0.7 in dark mode. `text-primary` renders
with it in both themes ; fills keep `--primary`.

## One brand, two themes

A single brand color can't serve both grounds : black vanishes on the dark
theme, white or pale yellow on the light one. So each theme gets its own
version, computed by `brandThemeVars` in
[`brand-theme.ts`](../../../services/web/src/lib/brand-theme.ts) (shared by the
layout and the organization page's preview) :

- **Light** : `adaptBrandColor(primary, "light")`.
- **Dark** : depends on `primaryColorDarkMode` : `"custom"` uses the org's
  `primaryColorDark` as is, `"same"` uses the primary as is, and `"adaptive"`
  (the default, also for null) uses `adaptBrandColor(primary, "dark")`. The
  organization page sets `"custom"` when its **Dark theme color** field holds
  a color and `"adaptive"` when it's empty ; `"same"` is API-only for now.

[`adaptBrandColor`](../../../packages/common/src/color.ts) (`@monark/common/color`)
leaves a color untouched when its contrast against that theme's background is
at least **2:1** (`BRAND_ADAPT_BELOW`) ; below that it moves the color's oklch
lightness (up for dark, down for light) in small steps, keeping the hue and
easing chroma so a lifted navy doesn't turn neon, until the contrast reaches
**3:1** (`BRAND_ADAPT_TARGET`, WCAG's non-text minimum). So Monark orange
(2.3:1 on cream, 8:1 on espresso) and the default blue are never touched,
black becomes `#606060` in dark mode, white `#909090` in light mode. Each
theme's foreground (`pickContrastForeground`) is computed for its own color.

The layout emits `--brand-light`, `--brand-light-foreground`, `--brand-dark`,
`--brand-dark-foreground`, `--brand-accent-light` and `--brand-accent-dark` ;
`:root` maps `--primary` to the light pair, `.dark` to the dark pair, and every
other brand token reads `--primary`. The accent follows the adapted primary
unless a `BRANDING_ACCENT` is in force, which is adapted the same way.

The organization page keeps this short : one notice under the primary color
when it will be adjusted in either theme, and, under **Advanced options**, the
optional **Dark theme color** (with a notice only when that explicit color is
itself below 2:1 on the dark background) and the **Background tint** slider. Emails keep
using `primaryColor` unadapted (they render on a white card).

**Emails are separate.** `@monark/notifications` deliberately ignores
`brandPrimary` and defaults to black, because a mid-saturation brand color reads
poorly on an email's white card. The singleton org's `primaryColor` (and its
uploaded logo) DO reach app-sent email ; see
[`enrich.ts`](../../../packages/notifications/src/server/enrich.ts).
