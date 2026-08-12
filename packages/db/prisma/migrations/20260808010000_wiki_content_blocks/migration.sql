-- Wiki page body becomes a BlockNote block array (JSONB) plus a derived
-- plain-text projection (`contentText`) that keeps search a cheap text
-- `contains`. Pre-release : existing HTML bodies are RESET TO EMPTY rather than
-- converted (see docs/features-planning/proposed/block-editor.md, "No content
-- backfill"). Authors re-enter the handful of pages that exist.

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN "contentText" TEXT NOT NULL DEFAULT '';

-- The old TEXT default ('') can't cast to jsonb, so drop it before the type
-- change, reset every row to an empty block array, then set the jsonb default.
ALTER TABLE "WikiPage" ALTER COLUMN "content" DROP DEFAULT;
ALTER TABLE "WikiPage" ALTER COLUMN "content" TYPE JSONB USING '[]'::jsonb;
ALTER TABLE "WikiPage" ALTER COLUMN "content" SET DEFAULT '[]';
