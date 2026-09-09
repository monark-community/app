# Organizations

`/admin/organizations` goes straight to `/admin/organizations/<id>` for the one organization on the deploy. Lets you manage its brand + identity.

### Detail / edit

The single edit surface for an organization :

- **Logo** : click to upload (or replace / remove if a logo is already set). Square JPEG, PNG or WebP up to 2 MB ; cropped + compressed automatically (SVG isn't accepted). This is the mark shown on the sign-in page, in the nav rail, and at the top of the emails the app sends.
- **Display name** : what shows everywhere a user sees the org's name. Saves on blur.
- **Slug** : the URL-safe identifier. 2–60 characters, lowercase letters / digits / dashes only. Saves on blur ; trying to use a slug that's already taken surfaces a clean error toast. **Renaming a slug** doesn't break old links ; the previous slug is recorded with a 90-day redirect so anything pointing at the old URL still resolves.
- **Primary color** : hex code (e.g. `#2563EB`) ; the live swatch next to the input previews the value as you type. Themes the whole app for that org (buttons, focus rings, the sidebar accent, the first chart series) plus its transactional emails. Text painted on top flips between black and white automatically so a light or pastel color stays readable. Leave it blank to fall back to the color the deployment was configured with.
- **AI assistant name** : what this organization's built-in assistant is called, in the chat panel and in its own replies. Only appears when assistant branding is turned on for the org (an operator flips `chat.org-branding` in Feature flags) ; leave it blank and the assistant answers to the name the deployment was configured with, shown as the field's placeholder.

Saving any field emits a domain event so downstream listeners (notification fan-out, audit log) record what changed.
