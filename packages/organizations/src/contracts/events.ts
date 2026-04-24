import type { DomainEventBase } from "@monark/common/contracts/events"
import type { Role } from "@monark/db"

export type OrganizationCreatedEvent = DomainEventBase & {
  type: "organization.created"
  organizationId: string
  actorId: string
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
  role: Role
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
  | MemberJoinedEvent
  | MemberRemovedEvent
  | InviteSentEvent
  | InviteAcceptedEvent
