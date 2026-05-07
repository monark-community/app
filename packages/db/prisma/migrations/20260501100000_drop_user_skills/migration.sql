-- Drops the per-user skills column. Phase 1 keeps the starter agnostic of
-- Monark-specific profile fields ; skills will land back as an extended
-- module if/when a downstream app needs them.
ALTER TABLE "User" DROP COLUMN "skills";
