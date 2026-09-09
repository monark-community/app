# One organization

The app serves exactly one organization. The Organizations tab goes straight to
that organization's edit page rather than a list ; the role manager, the invite
dialog and the role-assign dialog all scope to it automatically, so nothing asks
you which organization you mean.

Serving several businesses means running several instances of the app, each with
its own database and domain — not one deployment holding several organizations.
