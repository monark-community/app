---
type: tutorial
---

# Make your first API call

Create an API key, confirm it works, then list and create records in a data model from the command line. You'll finish with a record you made through the API showing in the app. This is for developers writing scripts or integrations against a Monark organization, and it takes about 10 minutes.

## Before you start

- A Monark account in the organization you want to reach, with permission to manage API keys. If **API keys** says you don't have permission, ask an admin.
- The public API turned on for your organization. It is off by default; whoever runs your Monark instance turns it on. On a local development setup, `pnpm enable:dev-flags` does it.
- A data model you can read and add records to. This tutorial uses one with the key `projects`; use any model you have.
- `curl` in a terminal.

## Create a key

1. Open your user menu, choose **Profile**, then open the **API keys** tab.
2. If you see a notice that the public API isn't enabled for your organization yet, stop here and get it turned on first.
3. Click **New API key**.
4. Enter a **Name** such as `First API call`, keep **Full access**, and set **Expiration** to **30 days**.
5. Click **Create key**. The key appears once, starting with `mrk_`. Click **Copy** and keep it somewhere safe; you can't see it again.
6. Under **Using your keys**, note the **Base URL**. It ends in `/api/v1`.

Store both in your shell so the next commands work as written:

```sh
export MONARK_API="https://api.example.com/api/v1"   # your Base URL
export MONARK_KEY="mrk_..."                          # your key
```

## Check who the key acts as

```sh
curl -H "Authorization: Bearer $MONARK_KEY" "$MONARK_API/me"
```

You get your user id and organization id:

```json
{ "userId": "…", "organizationId": "…" }
```

A `401` means the key was mistyped, revoked or expired. A `404` means the public API is still off.

## Find a model and its fields

1. List the models your key can see:
   ```sh
   curl -H "Authorization: Bearer $MONARK_KEY" "$MONARK_API/models"
   ```
   The response has an `items` array; each model has a `key`, such as `projects`.
2. List that model's fields, so you know which keys to write:
   ```sh
   curl -H "Authorization: Bearer $MONARK_KEY" "$MONARK_API/models/projects/fields"
   ```
   You get an array of fields, each with a `key`, a `label` and a `type`. Every model has a `title` field.

## Create a record

Send the values in `data`, keyed by field key. Add any required fields your model has:

```sh
curl -X POST \
  -H "Authorization: Bearer $MONARK_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data":{"title":"Created from the API"}}' \
  "$MONARK_API/models/projects/records"
```

The response is the new record, with its `id`. A `400` with `validation_error` names the field that was rejected.

## See it in the app

1. Open **Data** in the navigation and pick the model.
2. Find **Created from the API** in the list. The key acted as you, so the record is yours like any other you create.

Then list the records through the API to see the same record there:

```sh
curl -H "Authorization: Bearer $MONARK_KEY" "$MONARK_API/models/projects/records?limit=5"
```

## What you built

You made a key, confirmed its identity, read a model's structure and wrote a record that appears in the app. Everything the key does is checked against your own permissions, so it can never do more than you can.

Next:

- [Create a key with limited access](create-a-key-with-limited-access.md) before you put a key into a real integration.
- [Page through results](page-through-results.md) to read more than one page of records.
- [Public API reference](../../reference/public-api.md) for every endpoint, error and limit.
