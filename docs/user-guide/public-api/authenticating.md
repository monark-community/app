# Authenticating

Send the key as a Bearer token on every request:

```bash
curl -H "Authorization: Bearer mrk_your_key_here" \
  https://<your-monark-host>/api/v1/me
```

`GET /api/v1/me` returns the identity + organization the key acts as ; a good
first call to confirm your key works. The exact base URL for your deployment is
shown on the Account → API keys page.
