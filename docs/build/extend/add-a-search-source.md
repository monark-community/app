---
type: how-to
---

# Add a search source

Make your module's records, cards or pages show up in the global search palette, grouped under their own heading.

1. Register a source in `src/server/search-source.ts`. It reuses your module's own search and applies its own access checks:
   ```ts
   import { registerSearchSource } from "@monark/common";
   import { requireOrg } from "@monark/organizations/server";
   import { requirePermission } from "@monark/rbac/server";

   export function registerPostsSearchSource(): void {
     registerSearchSource({
       module: "posts",
       groupId: "posts",
       label: "Posts",
       run: async (ctx, query, limit) => {
         if (!ctx.userId) return [];
         const org = await requireOrg({ userId: ctx.userId, activeOrganizationId: ctx.activeOrganizationId });
         await requirePermission(ctx, "posts.view", org.id);
         const posts = await searchPosts(org.id, query);
         return posts.slice(0, limit).map((p) => ({ id: p.id, title: p.title, href: `/posts/${p.id}` }));
       },
     });
   }
   ```
   Build `href` on the server. Add a `subtitle` for context, such as the board a card is on.
2. Call the helper in `services/api/src/server.ts`, in the search-sources block. The order there is the order of groups in the palette.
3. Add the group's heading, `globalSearch.groups.posts`, to every catalog in `services/web/src/messages/`.
4. Add an icon for the group to the icon map in `services/web/src/components/global-search/global-search-dialog.tsx`.
5. Open the palette in the app and type part of a title. Your hits appear under their heading.

Good to know:

- A source that fails or is denied doesn't break the palette; the other groups still show.
- A module with a page also needs a navigation entry; that entry makes the page reachable by name in the palette too.

Next: [Add an automation node type](add-an-automation-node.md)
