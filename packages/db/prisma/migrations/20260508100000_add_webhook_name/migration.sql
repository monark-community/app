-- Add operator-facing `name` to WebhookEndpoint.
--
-- Done in three statements so existing rows survive the NOT NULL
-- promotion :
--   1. Add the column nullable so the ALTER doesn't fail on existing
--      rows that have no value yet.
--   2. Backfill from the URL : strip the scheme (http(s)://), trim a
--      trailing slash, and cap at 80 chars. Produces something
--      readable (`hooks.example.com/webhooks/monark`) without
--      requiring an operator pass before the migration lands.
--   3. Promote to NOT NULL. From here on, every insert needs an
--      explicit name (the `webhooks.create` procedure enforces that
--      at the application layer too).

-- 1. Add nullable.
ALTER TABLE "WebhookEndpoint" ADD COLUMN "name" TEXT;

-- 2. Backfill from URL.
UPDATE "WebhookEndpoint"
SET "name" = LEFT(
  REGEXP_REPLACE(
    REGEXP_REPLACE("url", '^https?://', ''),
    '/$', ''
  ),
  80
)
WHERE "name" IS NULL;

-- Defensive : any row that ended up with an empty string after the
-- regex (degenerate URLs without a host) gets a placeholder so the
-- NOT NULL promotion doesn't fail.
UPDATE "WebhookEndpoint"
SET "name" = 'Webhook ' || LEFT("id", 8)
WHERE "name" IS NULL OR "name" = '';

-- 3. Promote to NOT NULL.
ALTER TABLE "WebhookEndpoint" ALTER COLUMN "name" SET NOT NULL;
