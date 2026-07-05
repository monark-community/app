import { registerEventTypes } from "@monark/common";

// Project and industry events register under separate group keys
// ("projects" / "industries") so the webhook subscription picker lists
// them as two independent categories — a subscriber can follow the
// shared taxonomy without also getting every project mutation. The
// event `type` strings are unchanged (`project.*` / `industry.*`) ; only
// the grouping differs.
const PROJECT_EVENT_TYPES = {
  "project.created": {
    description:
      "A new project was created by an admin (title + slug + initial status / industries / contributors).",
  },
  "project.updated": {
    description:
      "Project fields rotated. `changed` array carries which (title, slug, url, description, publicStatus, keywords, industries, contributors).",
  },
  "project.deleted": {
    description: "Project soft-deleted (`hard: false`) or hard-deleted (`hard: true`).",
  },
} as const;

const INDUSTRY_EVENT_TYPES = {
  "industry.created": {
    description: "A new industry was added to the shared taxonomy.",
  },
  "industry.updated": {
    description: "An industry was renamed (displayName) or its slug was rotated.",
  },
  "industry.deleted": {
    description: "An industry was removed from the shared taxonomy (soft or hard).",
  },
} as const;

export function registerProjectsEventTypes(): void {
  registerEventTypes("projects", PROJECT_EVENT_TYPES);
  registerEventTypes("industries", INDUSTRY_EVENT_TYPES);
}
