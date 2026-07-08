-- Restore per-org key uniqueness among LIVE Data Models only. The prior
-- 20260707050000 migration (org-required) replaced the original partial-
-- unique indexes with a plain unique on (organizationId, key), which also
-- reserved a soft-deleted model's key indefinitely. But the data layer
-- (findDataModelByKey / findFreeDataModelKey) filters `deletedAt IS NULL`
-- and expects a soft-deleted key to free up for reuse. Swap back to a
-- partial unique so the DB and the data layer agree. Prisma's `@@unique`
-- can't express the WHERE, so this is a hand-written index — schema.prisma
-- documents it in a comment on the DataModel model.
DROP INDEX IF EXISTS "DataModel_organizationId_key_key";
CREATE UNIQUE INDEX "DataModel_org_key_active_unique"
  ON "DataModel" ("organizationId", "key")
  WHERE "deletedAt" IS NULL;
