# 1.5 Copy the api URL

Once the deploy goes green, the dashboard shows the public URL. Format : `https://monark-api.onrender.com` (or whatever Render auto-assigns).

Update `monark-cron-shared.API_URL` to this value. The two cron services pick it up on their next scheduled run.

---
