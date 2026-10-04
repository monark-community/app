---
type: how-to
---

# Page through results

Read every record in a model, one page at a time. List endpoints return at most 100 rows per call, 25 by default.

1. Request the first page with a page size:
   ```sh
   curl -H "Authorization: Bearer $MONARK_KEY" \
     "$MONARK_API/models/projects/records?limit=100"
   ```
   The response holds `items`, `nextCursor` and `total` (the number of matching records across all pages).
2. If `nextCursor` is a string, request the next page with it, keeping the same `limit` and `search`:
   ```sh
   curl -H "Authorization: Bearer $MONARK_KEY" \
     "$MONARK_API/models/projects/records?limit=100&cursor=<nextCursor>"
   ```
3. Repeat until `nextCursor` is `null`. That was the last page.

In a script:

```js
let cursor = null;
const records = [];
do {
  const url = new URL(`${process.env.MONARK_API}/models/projects/records`);
  url.searchParams.set("limit", "100");
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.MONARK_KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const page = await res.json();
  records.push(...page.items);
  cursor = page.nextCursor;
} while (cursor);
```

## Narrow the list first

Add `search` to match record titles and slugs, ignoring case: `?search=acme&limit=100`. Keep it on every page request; a cursor only makes sense with the filter it came from.

Good to know:

- Pages are ordered newest-updated first. A record changed while you page can move, so a long export may see it twice or miss it; dedupe by `id`.
- `GET /models` pages the same way.
- Deleted records are left out.

Next: [Handle errors and rate limits](handle-errors-and-rate-limits.md)
