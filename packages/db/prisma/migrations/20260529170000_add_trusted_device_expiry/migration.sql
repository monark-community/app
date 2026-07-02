-- Add a DB-side trust expiry to TrustedDevice. The browser cookie's
-- Max-Age already caps a recognized device at 400 days (RFC 6265bis),
-- but the row lived forever; this column is the belt-and-suspenders
-- gate that the app's `where: { expiresAt: { gt: now() } }` filters
-- will key off.
--
-- Done in three steps so the migration is safe on a populated table :
--   1. ADD the column with a server-side default (instant ; no rewrite).
--   2. Backfill existing rows : align each row's expiry to its actual
--      last activity rather than "the migration ran today" — a device
--      last seen 2 years ago lands already-expired and the sweep cron
--      will prune it on first run.
--   3. Re-assert the default so future inserts that omit the column
--      (test fixtures, ad-hoc psql) land 400 days from now.
--
-- Final SET DEFAULT is redundant with step 1 on Postgres 16, but kept
-- explicit so the intent ("the column always has a sensible default")
-- survives a future schema dump / restore cycle.

ALTER TABLE "TrustedDevice"
  ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (now() + INTERVAL '400 days');

UPDATE "TrustedDevice"
SET "expiresAt" = "lastSeenAt" + INTERVAL '400 days';

ALTER TABLE "TrustedDevice"
  ALTER COLUMN "expiresAt" SET DEFAULT (now() + INTERVAL '400 days');

CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");
