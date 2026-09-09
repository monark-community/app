-- MQL-scoped record permissions.
--
-- A DataModelRoleScope row says: this role may perform this verb on the records
-- of this model that satisfy `query` (a MonarkQL FilterNode tree).
--
-- Roles stay ADDITIVE. The effective predicate is the OR, over every role the
-- caller holds that GRANTS the verb on this model, of that role's scope (or
-- TRUE when that role has no scope row). So one unscoped granting role keeps
-- the caller unrestricted, and a scope only ever narrows the access conferred
-- by its own role. No rows anywhere = today's behavior, so this ships inert
-- until an admin configures a scope.
--
-- Bypassed by `data-models.view-all-records`, the same capability that bypasses
-- DataRecordRoleAccess (see 20260908120000_split_record_visibility_permission).
--
-- NOTE: `prisma migrate diff` also emits DROP INDEX for every trigram / GIN
-- index plus a TrustedDevice default re-set, because those are created by raw
-- SQL the Prisma datamodel cannot express, so they are re-emitted on every
-- diff. They are deliberately stripped here (docs/agents/schema-changes.md).

-- CreateEnum
CREATE TYPE "DataRecordScopeVerb" AS ENUM ('READ', 'WRITE', 'DELETE');


-- CreateTable
CREATE TABLE "DataModelRoleScope" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "dataModelId" TEXT NOT NULL,
    "verb" "DataRecordScopeVerb" NOT NULL,
    "query" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataModelRoleScope_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "DataModelRoleScope_dataModelId_idx" ON "DataModelRoleScope"("dataModelId");


-- CreateIndex
CREATE INDEX "DataModelRoleScope_roleId_idx" ON "DataModelRoleScope"("roleId");


-- CreateIndex
CREATE UNIQUE INDEX "DataModelRoleScope_roleId_dataModelId_verb_key" ON "DataModelRoleScope"("roleId", "dataModelId", "verb");


-- AddForeignKey
ALTER TABLE "DataModelRoleScope" ADD CONSTRAINT "DataModelRoleScope_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "DataModelRoleScope" ADD CONSTRAINT "DataModelRoleScope_dataModelId_fkey" FOREIGN KEY ("dataModelId") REFERENCES "DataModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
