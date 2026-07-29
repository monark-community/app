import { registerEventTypes } from "@monark/common";

const ORGANIZATIONS_EVENT_TYPES = {
  "organization.created": {
    description: "A new organization was provisioned (bootstrap, admin form, or invite-driven).",
    fields: [
      { key: "organizationId", type: "string", description: "The organization that was created." },
      { key: "actorId", type: "string", description: "The user who created the organization." },
    ],
  },
  "organization.updated": {
    description:
      "Profile fields changed on an organization (name, slug, logo, brand color). Slug rotations include the previous slug in the payload.",
    fields: [
      { key: "organizationId", type: "string", description: "The organization that was updated." },
      { key: "actorId", type: "string", description: "The admin who updated the organization." },
      { key: "changed", type: "object", description: "List of profile fields that changed." },
      { key: "previousSlug", type: "string", description: "The prior slug when the slug rotated." },
    ],
  },
  "organization.member-joined": {
    description:
      "A user joined an organization (signup with invite, admin grant, or bootstrap singleton).",
    fields: [
      { key: "organizationId", type: "string", description: "The organization the user joined." },
      { key: "userId", type: "string", description: "The user who joined the organization." },
    ],
  },
  "organization.member-removed": {
    description: "A user was removed from an organization, either self-service or by an admin.",
    fields: [
      { key: "organizationId", type: "string", description: "The organization the user left." },
      { key: "userId", type: "string", description: "The user who was removed." },
      {
        key: "actorId",
        type: "string",
        description: "Who removed the member: the user or an admin.",
      },
    ],
  },
  "organization.invite-sent": {
    description: "An admin invited an external email to join the organization at a specific role.",
    fields: [
      { key: "organizationId", type: "string", description: "The organization the invite is for." },
      { key: "inviteId", type: "string", description: "The invite record's id." },
      { key: "email", type: "string", description: "The email address invited." },
      { key: "roleId", type: "string", description: "The role the invitee was offered." },
      {
        key: "roleKey",
        type: "string",
        description: "The offered role's key, duplicated for convenience.",
      },
      { key: "actorId", type: "string", description: "The admin who sent the invite." },
    ],
  },
  "organization.invite-accepted": {
    description:
      "An invitee completed signup (or signed in) and the membership + role were stamped.",
    fields: [
      {
        key: "organizationId",
        type: "string",
        description: "The organization the invite was for.",
      },
      { key: "inviteId", type: "string", description: "The accepted invite's id." },
      { key: "userId", type: "string", description: "The user who accepted the invite." },
    ],
  },
} as const;

export function registerOrganizationsEventTypes(): void {
  registerEventTypes("organizations", ORGANIZATIONS_EVENT_TYPES);
}
