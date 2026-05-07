import { registerEventTypes } from "@monark/common"

const USERS_EVENT_TYPES = {
  "user.profile-updated": {
    description:
      "Profile fields changed on a user (display name, avatar, banner, bio, locale).",
  },
  "user.email-changed": {
    description:
      "The user completed the two-side OTP confirmation flow ; their primary email is now the new value.",
  },
  "user.deletion-requested": {
    description:
      "A user (or admin) requested account deletion. The 14-day grace window starts ; the row's `deletedAt` is now stamped.",
  },
  "user.deletion-canceled": {
    description:
      "A pending deletion was canceled before the grace window expired. The user can sign in again normally.",
  },
  "user.deleted": {
    description:
      "Hard-delete after the 14-day grace window. Personal data was anonymized + the row was removed from Supabase Auth.",
  },
} as const

export function registerUsersEventTypes(): void {
  registerEventTypes("users", USERS_EVENT_TYPES)
}
