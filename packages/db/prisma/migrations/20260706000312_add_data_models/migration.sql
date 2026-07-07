-- CreateEnum
CREATE TYPE "DataFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'RICH_TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'DATETIME', 'SELECT', 'MULTI_SELECT', 'RELATION', 'URL', 'EMAIL');

-- AlterTable
ALTER TABLE "TrustedDevice" ALTER COLUMN "expiresAt" SET DEFAULT (now() + INTERVAL '400 days');

-- CreateTable
CREATE TABLE "DataModel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "titleFieldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "DataModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataField" (
    "id" TEXT NOT NULL,
    "dataModelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "DataFieldType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "indexed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "DataField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRecord" (
    "id" TEXT NOT NULL,
    "dataModelId" TEXT NOT NULL,
    "organizationId" TEXT,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "DataRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataModelIntegration" (
    "id" TEXT NOT NULL,
    "dataModelId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "slotMappings" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataModelIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataFieldIndex" (
    "id" TEXT NOT NULL,
    "dataFieldId" TEXT NOT NULL,
    "indexName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataFieldIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataModel_organizationId_idx" ON "DataModel"("organizationId");

-- CreateIndex
CREATE INDEX "DataModel_deletedAt_idx" ON "DataModel"("deletedAt");

-- CreateIndex
CREATE INDEX "DataField_dataModelId_archivedAt_idx" ON "DataField"("dataModelId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DataField_dataModelId_key_key" ON "DataField"("dataModelId", "key");

-- CreateIndex
CREATE INDEX "DataRecord_dataModelId_deletedAt_idx" ON "DataRecord"("dataModelId", "deletedAt");

-- CreateIndex
CREATE INDEX "DataRecord_organizationId_dataModelId_idx" ON "DataRecord"("organizationId", "dataModelId");

-- CreateIndex
CREATE INDEX "DataRecord_dataModelId_updatedAt_idx" ON "DataRecord"("dataModelId", "updatedAt");

-- CreateIndex
CREATE INDEX "DataModelIntegration_module_idx" ON "DataModelIntegration"("module");

-- CreateIndex
CREATE UNIQUE INDEX "DataModelIntegration_dataModelId_module_key" ON "DataModelIntegration"("dataModelId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "DataFieldIndex_dataFieldId_key" ON "DataFieldIndex"("dataFieldId");

-- CreateIndex
CREATE UNIQUE INDEX "DataFieldIndex_indexName_key" ON "DataFieldIndex"("indexName");

-- AddForeignKey
ALTER TABLE "DataModel" ADD CONSTRAINT "DataModel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataField" ADD CONSTRAINT "DataField_dataModelId_fkey" FOREIGN KEY ("dataModelId") REFERENCES "DataModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRecord" ADD CONSTRAINT "DataRecord_dataModelId_fkey" FOREIGN KEY ("dataModelId") REFERENCES "DataModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRecord" ADD CONSTRAINT "DataRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataModelIntegration" ADD CONSTRAINT "DataModelIntegration_dataModelId_fkey" FOREIGN KEY ("dataModelId") REFERENCES "DataModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────
-- Hand-written : Prisma's `@@unique` can't express a NULL-aware WHERE,
-- so DataModel.key (unique per-org, or globally unique when platform-
-- wide) and DataRecord.slug (unique when present) are partial indexes
-- instead of declarative `@@unique`s. See docs/features-planning/
-- phase-2/polymorphic-db.md for the storage-shape rationale.

CREATE UNIQUE INDEX "DataModel_key_platform_unique"
  ON "DataModel" ("key")
  WHERE "organizationId" IS NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "DataModel_org_key_unique"
  ON "DataModel" ("organizationId", "key")
  WHERE "organizationId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX "DataRecord_model_slug_unique"
  ON "DataRecord" ("dataModelId", "slug")
  WHERE "slug" IS NOT NULL AND "deletedAt" IS NULL;

-- Baseline GIN index over the whole custom-field payload : makes every
-- admin-defined field filterable correctly from day one (jsonb_path_ops
-- supports containment / `@>` queries well ; it does not by itself
-- guarantee a fast plan at scale on a hot field — that's what the
-- opt-in per-field expression index in DataFieldIndex is for).
CREATE INDEX "DataRecord_data_gin"
  ON "DataRecord" USING GIN ("data" jsonb_path_ops);
