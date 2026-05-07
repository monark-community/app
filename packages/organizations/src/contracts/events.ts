import type { DomainEventBase } from "@monark/common/contracts/events"

export type OrganizationCreatedEvent = DomainEventBase & {
  type: "organization.created"
  organizationId: string
  actorId: string
}

// Emitted when an admin updates an organization profile (displayName, slug,
// logoUrl, primaryColor). The `changed` array carries which fields rotated
// so subscribers can branch (e.g. invalidate slug-keyed caches when slug
// changed). Actor is the rbac-gated admin who triggered the mutation.
export type OrganizationUpdatedEvent = DomainEventBase & {
  type: "organization.updated"
  organizationId: string
  actorId: string
  changed: Array<"displayName" | "slug" | "logoUrl" | "primaryColor">
  previousSlug?: string
}

export type MemberJoinedEvent = DomainEventBase & {
  type: "organization.member-joined"
  organizationId: string
  userId: string
}

export type MemberRemovedEvent = DomainEventBase & {
  type: "organization.member-removed"
  organizationId: string
  userId: string
  actorId: string
}

export type InviteSentEvent = DomainEventBase & {
  type: "organization.invite-sent"
  organizationId: string
  inviteId: string
  email: string
  // `roleId` references the `Role` table. `roleKey` is duplicated on
  // the event so subscribers don't need to round-trip back to the DB
  // to learn which role was offered.
  roleId: string
  roleKey: string
  actorId: string
}

export type InviteAcceptedEvent = DomainEventBase & {
  type: "organization.invite-accepted"
  organizationId: string
  inviteId: string
  userId: string
}

// Emitters for these flows land with the invite/create/switch implementations;
// Phase 1 MVP ships the types so subscribers can type-import them now.
export type OrganizationsEvents =
  | OrganizationCreatedEvent
  | OrganizationUpdatedEvent
  | MemberJoinedEvent
  | MemberRemovedEvent
  | InviteSentEvent
  | InviteAcceptedEvent
