# TOTP enforcement on admins

Admins have to enrol in two-factor authentication within 7 days of signing in. Two visible tiers :

- **Soft wall** (within the 7-day window) : amber banner across the top of every `/account` page. Other admin routes still work. The banner says "Two-factor required for admin access ; enable TOTP below."
- **Hard wall** (overdue) : red banner with a count of days overdue. Every route outside `/account` redirects you back here ; clicking an admin link triggers a toast saying "Admin access restricted ; re-enable two-factor authentication to regain access."

Once you enrol the banners disappear immediately and admin routes unlock without a refresh.
