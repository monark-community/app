# 1.2 Fill the `monark-cron-shared` env-var group

| Key           | Value                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| `CRON_SECRET` | the secret from 0.1                                                                         |
| `API_URL`     | `https://monark-api.onrender.com` ← placeholder for now ; we'll update once the api is live |

The api service inherits both via `fromGroup: monark-cron-shared` ; no need to duplicate.
