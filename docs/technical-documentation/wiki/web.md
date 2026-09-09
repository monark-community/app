# Web

The section lives in `services/web/src/app/(authed)/wiki` : a server `layout.tsx`
gates on the flag + `wiki.read`, fetches the tree + the caller's permissions, and
renders a client `WikiShell` (the tree sidebar, mobile drawer, and the
move / delete dialogs) around the page editor (`WikiPageView` ; icon + title
inputs, the shared `BlockEditor` ; BlockNote, uncontrolled so mobile IME/Enter
isn't disrupted : with debounced autosave). Discoverability is
wired through `PRIMARY_NAV` (drawer + "Go to" palette) and a `SEARCH_PROVIDERS`
content provider backed by `wiki.pages.search`.
