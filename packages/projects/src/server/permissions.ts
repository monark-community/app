import { registerPermissions } from "@monark/rbac/server";

// Granular permissions for the projects + industries surface.
// v1 surfaces all CRUD behind the admin role's umbrella grant ; the
// granular split is for forward-compat — a "Curator" role that gets
// `projects.write` + `industries.read` without `projects.delete` can
// be assigned later without touching this file.
//
// Industry permissions are platform-scope (the taxonomy is shared
// across orgs) ; project permissions are org-scope (a "Curator"
// could be limited to a specific org's projects).

const PROJECT_PERMISSIONS = {
  read: {
    description: "Read project rows (admin list, detail, contributors).",
    category: "projects",
  },
  write: {
    description:
      "Create or edit projects (title, slug, status, keywords, industries, contributors).",
    category: "projects",
  },
  delete: {
    description: "Soft-delete or hard-delete projects.",
    category: "projects",
  },
} as const;

const INDUSTRY_PERMISSIONS = {
  read: {
    description: "Read the industry taxonomy.",
    category: "projects",
  },
  write: {
    description: "Create or rename industries in the shared taxonomy.",
    category: "projects",
  },
  delete: {
    description: "Soft-delete or hard-delete industries from the shared taxonomy.",
    category: "projects",
  },
} as const;

export function registerProjectsPermissions(): void {
  registerPermissions("projects", PROJECT_PERMISSIONS);
  registerPermissions("industries", INDUSTRY_PERMISSIONS);
}
