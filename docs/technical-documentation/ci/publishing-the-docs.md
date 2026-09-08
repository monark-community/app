# Publishing the docs

The user guide, each extended module's user guide, and the technical documentation
are published as a website from a separate repository,
[monark-community/app-docs](https://github.com/monark-community/app-docs). That repo
owns the presentation ; this one owns the prose. Its sync job reads the Markdown out
of a checkout of this repo, converts it to MDX, and opens a PR against itself when the
result differs.

[notify-docs.yml](../../../.github/workflows/notify-docs.yml) is this side of that seam:
a push to `develop` touching `docs/user-guide/**`, `docs/technical-documentation/**`,
or `packages/*/docs/**` fires a `repository_dispatch` at the docs site so it syncs
within a minute or so. It is an **optimisation, not a dependency** ; the site also
syncs on a daily schedule, so if the credential below is missing or lapses, the docs
still land, just later. The workflow skips itself (with a notice, not a failure) when
the secrets aren't set.

The dispatch needs a GitHub App token scoped to `app-docs` with **Contents: read &
write** there: `DOCS_SYNC_APP_CLIENT_ID` + `DOCS_SYNC_APP_PRIVATE_KEY`. The App has to be
installed on `monark-community/app-docs` as well as here. This mirrors the
[changelog workflow](../../../.github/workflows/changelog-compile.yml)'s reasoning: an
App token can be scoped to exactly one repository, which the built-in `GITHUB_TOKEN`
(scoped to this repo) can't cross to at all.

Prose that isn't published (planning specs, the archive, `docs/agents`) doesn't
trigger anything. A link from a published page into that material is rewritten to an
absolute GitHub URL by the sync, so it stays reachable without being republished.
