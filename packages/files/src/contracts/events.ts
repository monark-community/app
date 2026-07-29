import type { DomainEventBase } from "@monark/common/contracts/events";

// Domain events emitted by the files module. Every state change emits one so
// other modules + the webhook outbox can react. `actorId` is the acting user.

export type FilesBucketCreatedEvent = DomainEventBase & {
  type: "files.bucket-created";
  bucket: string;
  isPublic: boolean;
  actorId: string;
};

export type FilesFileUploadedEvent = DomainEventBase & {
  type: "files.file-uploaded";
  fileId: string;
  organizationId: string;
  bucket: string;
  key: string;
  name: string;
  contentType: string;
  size: number;
  actorId: string;
};

export type FilesFileDeletedEvent = DomainEventBase & {
  type: "files.file-deleted";
  fileId: string;
  organizationId: string;
  bucket: string;
  key: string;
  actorId: string;
};

export type FilesEvents = FilesBucketCreatedEvent | FilesFileUploadedEvent | FilesFileDeletedEvent;
