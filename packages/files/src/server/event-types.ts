import { registerEventTypes } from "@monark/common";

// Operator-facing descriptions for the webhook subscription picker. Registering
// these makes every files domain event webhook-subscribable — no webhook code
// change beyond this.
const FILES_EVENT_TYPES = {
  "files.bucket-created": {
    description: "A storage bucket was created.",
    fields: [
      { key: "bucket", type: "string", description: "The bucket name." },
      {
        key: "isPublic",
        type: "boolean",
        description: "Whether the bucket serves objects publicly.",
      },
      { key: "actorId", type: "string", description: "The user who created the bucket." },
    ],
  },
  "files.file-uploaded": {
    description: "A file finished uploading (moved from pending to ready).",
    fields: [
      { key: "fileId", type: "string", description: "The stored file's id." },
      { key: "organizationId", type: "string", description: "The owning organization." },
      { key: "bucket", type: "string", description: "The bucket the file lives in." },
      { key: "key", type: "string", description: "The object key within the bucket." },
      { key: "name", type: "string", description: "The original filename." },
      { key: "contentType", type: "string", description: "The file's MIME type." },
      { key: "size", type: "number", description: "The file size in bytes." },
      { key: "actorId", type: "string", description: "The user who uploaded the file." },
    ],
  },
  "files.file-deleted": {
    description: "A file was deleted.",
    fields: [
      { key: "fileId", type: "string", description: "The stored file's id." },
      { key: "organizationId", type: "string", description: "The owning organization." },
      { key: "bucket", type: "string", description: "The bucket the file lived in." },
      { key: "key", type: "string", description: "The object key within the bucket." },
      { key: "actorId", type: "string", description: "The user who deleted the file." },
    ],
  },
} as const;

export function registerFilesEventTypes(): void {
  registerEventTypes("files", FILES_EVENT_TYPES);
}
