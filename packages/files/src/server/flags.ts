import { registerFlags } from "@monark/feature-flags/server";

// Feature flags owned by the files module (namespace `files.*`).
const FILES_FLAGS = {
  enabled: {
    description:
      "The generic file-upload service + the /admin/files page. Kill switch for the whole feature.",
    defaultOn: true,
  },
} as const;

export function registerFilesFeatureFlags(): void {
  registerFlags("files", FILES_FLAGS);
}
