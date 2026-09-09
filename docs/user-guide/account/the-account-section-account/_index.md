# The account section (`/account/...`)

Your avatar in the top-right corner of any page opens the user-menu drawer. The "About you" links there take you into the account tabs :

| URL                      | What it holds                                                                     |
| ------------------------ | --------------------------------------------------------------------------------- |
| `/account/profile`       | Display name, bio, avatar, banner, language, theme.                               |
| `/account/security`      | Email, password, two-factor authentication, trusted devices.                      |
| `/account/notifications` | Per-category × per-channel preferences.                                           |
| `/account/api-keys`      | Personal API keys for the public API (see the [public API guide](../../public-api/_index.md)). |
| `/account/danger`        | Schedule (or cancel) account deletion.                                            |

The account sidebar pinned to the left shows the same entries on wide viewports ; on narrow viewports it collapses to a horizontal strip above the content.

## In this section

- **[Security](security.md)**
- **[Notifications](notifications.md)**
- **[Danger zone](danger-zone.md)**

### Profile

- **Avatar + banner** : click either to upload a new image. Both are cropped + compressed automatically. Up to 5 MB per image. Once a banner or avatar is set, clicking re-opens a small menu with **Replace** and **Remove**.
- **Display name** : saves on blur. Empty values are allowed ; the app falls back to your email address everywhere a name would otherwise show.
- **Bio** : short free-form text, also saves on blur.
- **Language** : pick **English** or **Français**. The choice mirrors into your session cookie so the next page renders in the new language without a sign-out cycle. Emails the app sends you also follow this preference.
- **Theme** : Light / Dark / System. Saves immediately ; the page recolours without a reload.

While your account is in the deletion-grace window every field on this tab is locked read-only. A banner at the top of the section explains why and links to the danger tab where you can cancel.
