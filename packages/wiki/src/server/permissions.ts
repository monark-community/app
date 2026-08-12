import { registerPermissions } from "@monark/rbac/server";

const WIKI_PERMISSIONS = {
  read: {
    description: "View wiki pages.",
    category: "wiki",
  },
  create: {
    description: "Create wiki pages.",
    category: "wiki",
  },
  update: {
    description: "Edit wiki pages (title, icon, content) and move them in the tree.",
    category: "wiki",
  },
  delete: {
    description: "Delete and restore wiki pages (and their whole subtree).",
    category: "wiki",
  },
} as const;

export function registerWikiPermissions(): void {
  registerPermissions("wiki", WIKI_PERMISSIONS);
}
