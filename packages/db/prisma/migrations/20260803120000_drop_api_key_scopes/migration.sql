-- Authority is 100% RBAC now (a key acts with its principal's roles) ; the
-- coarse scope allow-list is removed. No data migration needed — the column is
-- simply dropped.
ALTER TABLE "ApiKey" DROP COLUMN "scopes";
