# Is it on?

The public API ships **off by default**. An organization admin turns it on in
**Admin → Feature flags** by enabling `public-api.enabled`. Until then, any key
you create is inert ; the account API-keys page shows a notice when that's the
case. (There's a separate `public-api.service-accounts` flag for the
service-account admin surface, covered below.)
