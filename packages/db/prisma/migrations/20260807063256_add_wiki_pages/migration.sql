-- AlterTable (idempotent re-apply of the dbgenerated INTERVAL default Prisma
-- can't see ; harmless, matches prior migrations. The phantom
-- `DROP INDEX "DataRecord_data_gin"` that migrate dev also emits was stripped
-- per docs/agents/schema-changes.md — it's a needed raw-SQL GIN index.)
ALTER TABLE "TrustedDevice" ALTER COLUMN "expiresAt" SET DEFAULT (now() + INTERVAL '400 days');

-- CreateTable
CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiPage_organizationId_parentId_position_idx" ON "WikiPage"("organizationId", "parentId", "position");

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WikiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
