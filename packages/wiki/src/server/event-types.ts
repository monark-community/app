import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions for the webhook subscription picker. Registering
// these is what makes every Wiki domain event webhook-subscribable — no webhook
// code change is needed beyond this.
const WIKI_EVENT_TYPES = {
  "wiki.page-created": {
    description: "A new wiki page was created.",
    fields: [
      { key: "pageId", type: "string", description: "The page that was created." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the page belongs to.",
      },
      {
        key: "parentId",
        type: "string",
        description: "The parent page id, or null for a top-level page.",
      },
      { key: "title", type: "string", description: "The page's title." },
      { key: "actorId", type: "string", description: "The user who created the page." },
    ],
  },
  "wiki.page-updated": {
    description: "A wiki page's title, icon, or content was edited.",
    fields: [
      { key: "pageId", type: "string", description: "The page that was updated." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the page belongs to.",
      },
      {
        key: "changed",
        type: "object",
        description: "List of page fields that changed (title / icon / content).",
      },
      { key: "actorId", type: "string", description: "The user who updated the page." },
    ],
  },
  "wiki.page-moved": {
    description: "A wiki page moved to a different parent or position in the tree.",
    fields: [
      { key: "pageId", type: "string", description: "The page that moved." },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the page belongs to.",
      },
      {
        key: "fromParentId",
        type: "string",
        description: "The parent the page moved from (null = top-level).",
      },
      {
        key: "toParentId",
        type: "string",
        description: "The parent the page moved to (null = top-level).",
      },
      { key: "actorId", type: "string", description: "The user who moved the page." },
    ],
  },
  "wiki.page-deleted": {
    description: "A wiki page was deleted, along with its whole subtree.",
    fields: [
      {
        key: "pageId",
        type: "string",
        description: "The page that was deleted (the subtree root).",
      },
      {
        key: "organizationId",
        type: "string",
        description: "The organization the page belongs to.",
      },
      {
        key: "pageIds",
        type: "object",
        description: "Every page id removed (the root and its descendants).",
      },
      { key: "actorId", type: "string", description: "The user who deleted the page." },
    ],
  },
} as const;

export function registerWikiEventTypes(): void {
  registerEventTypes("wiki", WIKI_EVENT_TYPES);
}
