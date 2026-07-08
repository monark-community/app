-- Platform-wide (null-org) Data Models are disallowed ; every Data Model is
-- org-scoped. Re-parent any existing null-org models + their records to the
-- singleton organization. This deploy is single-tenant ; a multi-tenant deploy
-- carrying platform-wide models would need an explicit target org per model.
UPDATE "DataModel"
  SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
  WHERE "organizationId" IS NULL;
UPDATE "DataRecord"
  SET "organizationId" = (SELECT "id" FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
  WHERE "organizationId" IS NULL;

-- Now that no nulls remain, require the column.
ALTER TABLE "DataModel" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "DataRecord" ALTER COLUMN "organizationId" SET NOT NULL;

-- Replace the NULL-aware partial-unique indexes on (organizationId, key) with a
-- single plain unique now that organizationId is always present. The name
-- matches what Prisma derives for `@@unique([organizationId, key])`.
DROP INDEX IF EXISTS "DataModel_key_platform_unique";
DROP INDEX IF EXISTS "DataModel_org_key_unique";
CREATE UNIQUE INDEX "DataModel_organizationId_key_key" ON "DataModel"("organizationId", "key");
