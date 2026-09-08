# Auth emails (Supabase-rendered)

Three emails do not come from the app at all ; signup confirmation, password
reset, and email change are rendered by **Supabase Auth** from
[`supabase/templates/`](../../../supabase/templates), with their subjects in
[`supabase/config.toml`](../../../supabase/config.toml). Supabase renders these
server-side and cannot reach `@monark/branding`, so **there is no env seam
here**.

They ship brand-neutral: no product name, a `#18181b` accent, and no wordmark.
Each carries a commented-out insertion point showing where to put yours. To
brand them:

1. Fill the wordmark insertion point in all three templates (prefer **text** ;
   Outlook desktop and parts of Gmail don't render SVG, and most clients block
   remote images by default).
2. Swap the `#18181b` accent for your brand color ; and keep the CTA label
   readable against it.
3. Set the three `subject` lines in `supabase/config.toml`.

These are the first emails a new user ever receives, which is why the default is
neutral rather than any one business's identity.

The pre-auth screens (signin, signup, the TOTP challenge, password reset) sit
across both layers: the logo resolves through the singleton org, while the
animated gradient backdrop behind them paints from `--primary` ; the org color
when one is set, the starter orange otherwise. Nothing to configure separately ;
set the org color and the sign-in screen follows.
