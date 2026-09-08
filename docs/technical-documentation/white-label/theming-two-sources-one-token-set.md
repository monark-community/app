# Theming: two sources, one token set

Brand color arrives from two places, and they feed **the same token set** ;
`--primary`, `--primary-foreground`, `--ring`, `--sidebar-primary`,
`--sidebar-ring`, `--chart-1`, `--brand-primary`, `--brand-accent`,
`--brand-foreground`, set on `<html>` by
[the root layout](../../../services/web/src/app/layout.tsx):

- **The singleton organization's `primaryColor`** (runtime : set in-app, or at
  provisioning via `INITIAL_ORG_PRIMARY_COLOR`) wins when it is set.
- **`BRANDING_PRIMARY`** (deploy time, via env) is used when it isn't. This is
  what themes a multi-tenant deploy, and a single-tenant one before its org is
  provisioned.

Either way the foreground painted on top is computed from WCAG relative
luminance, so a light or pastel brand color still yields legible buttons.
`BRANDING_ACCENT` is the second stop of the gradient surfaces ; when you don't
set one, the org color stands in for both stops rather than pairing your brand
with an unrelated placeholder.

The values in
[`globals.css`](../../../services/web/src/app/globals.css) are the neutral fallback
for surfaces rendered outside that layout (the component screenshot harness, for
instance) : the app itself always gets the tokens above.

**Emails are separate.** `@monark/notifications` deliberately ignores
`brandPrimary` and defaults to black, because a mid-saturation brand color reads
poorly on an email's white card. The singleton org's `primaryColor` (and its
uploaded logo) DO reach app-sent email ; see
[`enrich.ts`](../../../packages/notifications/src/server/enrich.ts).
