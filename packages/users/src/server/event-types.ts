import { registerEventTypes } from "@monark/common";

const USERS_EVENT_TYPES = {
  "user.profile-updated": {
    description: "Profile fields changed on a user (display name, avatar, banner, bio, locale).",
    fields: [
      { key: "userId", type: "string", description: "The user whose profile changed." },
      { key: "changed", type: "object", description: "List of profile fields that changed." },
    ],
  },
  "user.email-changed": {
    description:
      "The user completed the two-side OTP confirmation flow ; their primary email is now the new value.",
    fields: [
      { key: "userId", type: "string", description: "The user whose email changed." },
      { key: "previousEmail", type: "string", description: "The email address before the change." },
      { key: "newEmail", type: "string", description: "The new primary email address." },
    ],
  },
  "user.deletion-requested": {
    description:
      "A user (or admin) requested account deletion. The 14-day grace window starts ; the row's `deletedAt` is now stamped.",
    fields: [
      { key: "userId", type: "string", description: "The user who requested account deletion." },
      {
        key: "deletionCompletesAt",
        type: "date",
        description: "When the grace window expires and hard-delete runs.",
      },
    ],
  },
  "user.deletion-canceled": {
    description:
      "A pending deletion was canceled before the grace window expired. The user can sign in again normally.",
    fields: [
      {
        key: "userId",
        type: "string",
        description: "The user whose pending deletion was canceled.",
      },
    ],
  },
  "user.deleted": {
    description:
      "Hard-delete after the 14-day grace window. Personal data was anonymized + the row was removed from Supabase Auth.",
    fields: [
      { key: "userId", type: "string", description: "The user who was hard-deleted." },
      {
        key: "previousEmail",
        type: "string",
        description: "The email the account had before anonymization.",
      },
    ],
  },
} as const;

export function registerUsersEventTypes(): void {
  registerEventTypes("users", USERS_EVENT_TYPES);
}
