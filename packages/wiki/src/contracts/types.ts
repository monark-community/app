// Shared, transport-agnostic types for the Wiki module (no Prisma, no tRPC).
// The web app builds its page tree from `WikiTreeNode[]`.

/** One node in the page tree — the light shape the sidebar loads (no content). */
export type WikiTreeNode = {
  id: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  position: number;
};

/** An ancestor link for a page's breadcrumb (root-first). */
export type WikiAncestor = {
  id: string;
  title: string;
  icon: string | null;
};

/** Field caps shared by the server input schemas + the web forms. */
export const WIKI_TITLE_MAX = 200;
/** Sanitized HTML content ; the markup inflates it well past the plain text. */
export const WIKI_CONTENT_MAX = 200_000;
export const WIKI_ICON_MAX = 64;
