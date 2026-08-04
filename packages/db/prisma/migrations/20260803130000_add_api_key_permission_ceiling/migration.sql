-- Per-key least-privilege ceiling. Existing keys default to fullAccess=true
-- (acts with the owner's full authority), so this is additive + backward-safe.
ALTER TABLE "ApiKey" ADD COLUMN "fullAccess" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ApiKey" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
