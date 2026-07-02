import { registerEventTypes } from "@monark/common";

const PROJECTS_EVENT_TYPES = {
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
  registerEventTypes("projects", PROJECTS_EVENT_TYPES);
}
