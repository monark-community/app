# Organizations

`/admin/organizations` goes straight to `/admin/organizations/<id>` for the one organization on the deploy. Lets you manage its brand + identity.

### Detail / edit

The single edit surface for an organization :

- **Logo** : click to upload (or replace / remove if a logo is already set). Square JPEG, PNG or WebP up to 2 MB ; cropped + compressed automatically (SVG isn't accepted). This is the mark shown on the sign-in page, in the nav rail, and at the top of the emails the app sends.
- **Display name** : what shows everywhere a user sees the org's name. Saves on blur.
- **Slug** : the URL-safe identifier. 2–60 characters, lowercase letters / digits / dashes only. Saves on blur ; trying to use a slug that's already taken surfaces a clean error toast. **Renaming a slug** doesn't break old links ; the previous slug is recorded with a 90-day redirect so anything pointing at the old URL still resolves.
- **Primary color** : hex code (e.g. `#2563EB`) used for primary actions and accents across the platform, and in the emails the app sends. Text painted on top flips between black and white automatically. Leave it empty (the swatch shows a pipette) to use the color the deployment was configured with. If the color is too close to the light or the dark background (white or pale yellow in light mode, black in dark mode), a notice says it will be adjusted per theme to meet accessibility standards ; the app then moves it just enough for buttons, focus outlines and badges to stand out.
- **AI assistant name** : what this organization's built-in assistant is called, in the chat panel and in its own replies. Only appears when assistant branding is turned on for the org (an operator flips `chat.org-branding` in Feature flags) ; leave it blank and the assistant answers to the name the deployment was configured with, shown as the field's placeholder.

**Advanced options** (collapsed unless you've changed them) :

- **Dark theme color** : leave empty for an automatic, accessible adjustment of the primary color in dark mode, or set the exact color to use there. A notice appears if the color you set is too dark to stand out.
- **Background tint** : how much the primary color influences background surfaces, from 0 (neutral backgrounds) to 2. **Reset** goes back to the deployment's default. An orange brand, for example, gets warm cream backgrounds in light mode and deep espresso in dark mode ; text contrast stays the same whatever you pick.

**Previewing brand changes.** While you edit the primary color, the dark theme color or the background tint, the whole app previews the change live, including this page, and a note under the field reminds you it isn't saved yet. **Cancel** (or leaving the page) puts the saved colors back. Saving reloads the page so every screen picks up the new brand.

Saving any field emits a domain event so downstream listeners (notification fan-out, audit log) record what changed.
