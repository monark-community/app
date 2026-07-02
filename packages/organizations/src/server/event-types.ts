import { registerEventTypes } from "@monark/common";

const ORGANIZATIONS_EVENT_TYPES = {
  "organization.created": {
    description: "A new organization was provisioned (bootstrap, admin form, or invite-driven).",
  },
  "organization.updated": {
    description:
      "Profile fields changed on an organization (name, slug, logo, brand color). Slug rotations include the previous slug in the payload.",
  },
  "organization.member-joined": {
    description:
      "A user joined an organization (signup with invite, admin grant, or bootstrap singleton).",
  },
  "organization.member-removed": {
    description: "A user was removed from an organization, either self-service or by an admin.",
  },
  "organization.invite-sent": {
    description: "An admin invited an external email to join the organization at a specific role.",
  },
  "organization.invite-accepted": {
    description:
      "An invitee completed signup (or signed in) and the membership + role were stamped.",
  },
} as const;

export function registerOrganizationsEventTypes(): void {
  registerEventTypes("organizations", ORGANIZATIONS_EVENT_TYPES);
}
