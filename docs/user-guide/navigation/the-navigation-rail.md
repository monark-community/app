# The navigation rail

On a desktop-width screen a slim vertical **navigation rail** is pinned to the left edge of every authenticated page. Top to bottom :

1. **Brand mark** at the top : clicking it always goes to `/` (home).
2. **Destination icons** : one per top-level product surface you have access to (Calendar, Kanban, Wiki, Automation, Data). Each is icon-only with a tooltip on hover ; the icon for the section you're in is highlighted. A destination only appears when its feature is enabled for you, so the rail shows exactly what you can reach.
3. **Admin pin** at the bottom : a shield icon, only visible when you hold an admin or sysadmin role. Clicking it enters the admin section.

On narrow (phone / small tablet) viewports the rail is hidden ; tapping the **brand mark** in the app bar (it carries a small menu badge) opens the same destinations as a slide-in drawer from the left. The drawer lists **Home** first, then the module destinations, with the admin pin as a filled button at the bottom. Close it with the X, the dimmed overlay, or Escape.
