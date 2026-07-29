import { registerPermissions } from "@monark/rbac/server";

const FILES_PERMISSIONS = {
  view: {
    description: "View file listings and get download links.",
    category: "files",
  },
  upload: {
    description: "Upload new files.",
    category: "files",
  },
  delete: {
    description: "Delete files.",
    category: "files",
  },
  "manage-buckets": {
    description: "Create and configure storage buckets (size / type policy).",
    category: "files",
  },
} as const;

export function registerFilesPermissions(): void {
  registerPermissions("files", FILES_PERMISSIONS);
}
