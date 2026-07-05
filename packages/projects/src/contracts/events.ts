import type { DomainEventBase } from "@monark/common/contracts/events";

// Emitted on Project CRUD ; subscribers can hook for cache invalidation,
// audit logging, downstream search-index updates, etc. ActorId is the
// admin who triggered the mutation (never null because the admin gate
// upstream of the mutation ensures it).

export type ProjectCreatedEvent = DomainEventBase & {
  type: "project.created";
  projectId: string;
  organizationId: string;
  actorId: string;
};

export type ProjectUpdatedEvent = DomainEventBase & {
  type: "project.updated";
  projectId: string;
  organizationId: string;
  actorId: string;
  // Which fields rotated. Subscribers can branch on this to skip work
  // (e.g. only re-render the public surface when `title` / `slug` /
  // `publicStatus` / `description` change ; ignore pure keyword
  // rotations).
  changed: Array<
    | "title"
    | "slug"
    | "url"
    | "description"
    | "publicStatus"
    | "keywords"
    | "industries"
    | "contributors"
  >;
  previousSlug?: string;
};

export type ProjectDeletedEvent = DomainEventBase & {
  type: "project.deleted";
  projectId: string;
  organizationId: string;
  actorId: string;
  // Soft-delete by default ; the audit subscriber records this for
  // historical accounting. Hard-delete flips this true once the admin
  // confirms "permanently delete".
  hard: boolean;
};

export type IndustryCreatedEvent = DomainEventBase & {
  type: "industry.created";
  industryId: string;
  actorId: string;
};

export type IndustryUpdatedEvent = DomainEventBase & {
  type: "industry.updated";
  industryId: string;
  actorId: string;
  changed: Array<"displayName" | "slug" | "description">;
  previousSlug?: string;
};

export type IndustryDeletedEvent = DomainEventBase & {
  type: "industry.deleted";
  industryId: string;
  actorId: string;
  hard: boolean;
};

export type ProjectsEvents =
  | ProjectCreatedEvent
  | ProjectUpdatedEvent
  | ProjectDeletedEvent
  | IndustryCreatedEvent
  | IndustryUpdatedEvent
  | IndustryDeletedEvent;
